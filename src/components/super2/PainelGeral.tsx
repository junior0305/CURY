// Painel geral do superintendente, no visual da tela do diretor (classes .dir-* de diretoria.css,
// sem mexer nos arquivos do diretor). O que um super precisa para trabalhar o dia:
//   1. a meta do mês e o ritmo, com a meta de cada gerente (ele distribui);
//   2. "Decida hoje": as coisas mais caras agora, cada uma com a cobrança pronta para o gerente;
//   3. o funil do período (seletor único de datas): leads → atendidos → visitas → pastas → vendas;
//   4. as equipes, um cartão por gerente, com o gargalo de cada uma;
//   5. as pessoas: quem está online, no plantão, no plantão sem login, quem nunca entrou.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useMetasDiretoria } from "@/hooks/useDiretoria";
import { lerPastas } from "@/components/diretoria/pastasAnalise";
import { useEscopoSuper } from "./escopo";
import { useNumerosSuper, type LinhaSuper } from "./numeros";
import { usePeriodoSuper, SeletorPeriodoSuper } from "./Periodo";
import "@/styles/diretoria.css";

const sb = supabase as any;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const curto = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${Math.round(n / 1e3)} mil` : brl(n));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const inicioMes = (d = 0) => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth() + d, 1).toISOString().slice(0, 10); };
const nomeMes = (m: string) => new Date(m + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

export default function PainelGeral({ superId, superNome, onAbrir, irPara }: {
  superId: string; superNome: string; onAbrir: (id: string) => void; irPara: (aba: string) => void;
}) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const p = usePeriodoSuper("7d");
  const { supers, pastas, carregando } = useEscopoSuper(superId, p.dias);
  const { data: num, isFetching } = useNumerosSuper(supers, pastas, p.janela.de, p.janela.ate);
  const [desloc, setDesloc] = useState(0);
  const mes = inicioMes(desloc);
  const { data: metas } = useMetasDiretoria(superId, mes);
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  // diretor/admin no /super enxerga todas as superintendências: junta os mapas de cada uma
  const s0 = useMemo(() => ({
    plantaoSemLogin: Object.assign({}, ...supers.map((s) => s.plantaoSemLogin ?? {})) as Record<string, string[]>,
    logadosHoje: Object.assign({}, ...supers.map((s) => s.logadosHoje ?? {})) as Record<string, boolean>,
  }), [supers]);

  const { data: extra } = useQuery({
    queryKey: ["s2-painel-extra", gerentes.map((g) => g.id).join(",")], enabled: gerentes.length > 0, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: ps } = await sb.from("profiles").select("id,phone,bot_instance_id").in("id", gerentes.map((g) => g.id));
      const bots = (ps ?? []).map((x: any) => x.bot_instance_id).filter(Boolean);
      const { data: bi } = bots.length ? await sb.from("bot_instances").select("id,real_state").in("id", bots) : { data: [] };
      const estado = new Map((bi ?? []).map((b: any) => [b.id, b.real_state]));
      const { data: comp } = await sb.rpc("anuncios_comparativo");
      return {
        fone: new Map((ps ?? []).map((x: any) => [x.id, x.phone as string | null])),
        chip: new Map((ps ?? []).map((x: any) => [x.id, x.bot_instance_id ? estado.get(x.bot_instance_id) === "open" : false])),
        alertas: new Map(((comp ?? []) as any[]).map((r) => [r.dono_id, r.alertas as number])),
      };
    },
  });

  async function definir(id: string, n: number, nome: string) {
    const { error } = await sb.rpc("definir_meta", { p_mes: mes, p_dono: id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${nome} em ${nomeMes(mes)}: ${n} venda${n === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  }
  async function cobrar(gerenteId: string, gerenteNome: string, motivo: string, texto: string) {
    await sb.from("cobrancas").insert({ de_id: session?.user?.id, para_id: gerenteId, motivo, canal: "whatsapp", mensagem: texto }).then(() => {}, () => {});
    const f = String(extra?.fone.get(gerenteId) ?? "").replace(/\D/g, "");
    if (f) window.open(`https://wa.me/${f.startsWith("55") ? f : "55" + f}?text=${encodeURIComponent(texto)}`, "_blank");
    else toast.info(`${gerenteNome} não tem telefone cadastrado. A cobrança ficou só no histórico.`);
  }

  // meta do mês
  const d = metas?.dono;
  const realizado = d?.realizado ?? 0;
  const hoje = new Date(); const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = desloc === 0 ? Math.round((realizado / Math.max(1, hoje.getDate())) * diasMes) : null;
  const pctMeta = d?.meta ? Math.min(100, (realizado / d.meta) * 100) : 0;
  const ritmo = desloc === 0 ? (hoje.getDate() / diasMes) * 100 : 0;
  const filhos = (metas?.filhos ?? []).filter((f: any) => !/revisor/i.test(f.nome));
  const somaFilhos = filhos.reduce((a: number, f: any) => a + (f.meta ?? 0), 0);

  // decida hoje
  const linhaDe = (id: string) => num?.linhas.find((l) => l.id === id);
  type Dec = { id: string; peso: number; cls: string; tipo: string; quem: string; titulo: string; porque: string; acoes: [string, () => void][] };
  const decs: Dec[] = [];
  for (const g of gerentes) {
    const l = linhaDe(g.id);
    if (l && l.carteiraSemToque >= 10) decs.push({ id: `toque:${g.id}`, peso: l.carteiraSemToque, cls: "c-red", tipo: "dinheiro na mesa", quem: g.nome,
      titulo: `${nf(l.carteiraSemToque)} leads na equipe do ${g.nome} sem nenhum toque`, porque: "Lead pago parado na mão do corretor esfria em 2 dias.",
      acoes: [[`Cobrar ${g.nome}`, () => cobrar(g.id, g.nome, "leads sem toque", `${g.nome}, a sua equipe tem ${nf(l.carteiraSemToque)} leads novos sem nenhum contato no Comandra. Lead pago esfria em 48h. Consegue fazer a equipe chamar todos hoje até as 14h?`)],
        [`Abrir painel do ${g.nome}`, () => onAbrir(g.id)]] });
    const sl = s0?.plantaoSemLogin?.[g.id]?.length ?? 0;
    if (sl >= 1) decs.push({ id: `login:${g.id}`, peso: sl * 8, cls: "c-red", tipo: "equipe invisível", quem: g.nome,
      titulo: `${sl} corretor(es) do ${g.nome} no plantão hoje sem login no Comandra`, porque: `${s0!.plantaoSemLogin[g.id].slice(0, 3).join(", ")}: estão trabalhando, mas não recebem lead nem aparecem nos números.`,
      acoes: [[`Cobrar ${g.nome}`, () => cobrar(g.id, g.nome, "plantão sem login", `${g.nome}, ${sl} corretor(es) da sua equipe bateram ponto hoje e não têm login no Comandra (${s0!.plantaoSemLogin[g.id].join(", ")}). Cadastra hoje em Configurar → Equipe?`)]] });
    if (l && l.plantaoDias >= 10 && l.visitas === 0) decs.push({ id: `visita:${g.id}`, peso: l.plantaoDias, cls: "c-gray", tipo: "plantão sem visita", quem: g.nome,
      titulo: `${g.nome}: ${l.plantaoDias} dias de plantão e nenhuma visita no C2S`, porque: "Ou a visita não está sendo lançada no C2S, ou o plantão não converte.",
      acoes: [[`Cobrar ${g.nome}`, () => cobrar(g.id, g.nome, "plantão sem visita", `${g.nome}, a equipe somou ${l.plantaoDias} dias de plantão ${p.texto} e nenhuma visita lançada no C2S. A visita não está sendo registrada ou o plantão não está convertendo?`)]] });
    if ((extra?.alertas.get(g.id) ?? 0) >= 5) decs.push({ id: `ads:${g.id}`, peso: 20 + (extra!.alertas.get(g.id) ?? 0), cls: "c-org", tipo: "anúncio", quem: g.nome,
      titulo: `Conta de anúncio do ${g.nome} com ${extra!.alertas.get(g.id)} alertas`, porque: "O robô aponta verba desperdiçada. Veja em Leads → Mídia o que cortar.",
      acoes: [["Ver mídia", () => irPara("midia")]] });
    if (extra && extra.chip.get(g.id) === false) decs.push({ id: `chip:${g.id}`, peso: 6, cls: "c-gray", tipo: "WhatsApp desligado", quem: g.nome,
      titulo: `WhatsApp do ${g.nome} desconectado do Comandra`, porque: "Cobranças e avisos assinados por ele não saem. Ele reconecta em Configurar → Meu WhatsApp.",
      acoes: [[`Avisar ${g.nome}`, () => cobrar(g.id, g.nome, "chip desligado", `${g.nome}, seu WhatsApp está desconectado do Comandra. Entra em Configurar → Meu WhatsApp e lê o QR, leva 1 minuto.`)]] });
  }
  const rp = lerPastas(pastas);
  const paradas = rp.filter((x) => x.viva && (x.dias ?? 0) >= 7).length;
  if (paradas >= 1) decs.push({ id: "pastas", peso: paradas * 3, cls: "c-red", tipo: "pasta parada", quem: "suas equipes", titulo: `${paradas} pasta(s) viva(s) parada(s) há 7 dias ou mais no Junix`,
    porque: "Venda quase feita que pode cair.", acoes: [["Ver pastas", () => irPara("pastas")]] });
  const decida = decs.sort((a, b) => b.peso - a.peso).slice(0, 4);

  // funil do período
  const t = num?.total;
  const funil = t ? [
    { nome: "Leads que entraram", n: t.leadsTot, obs: `${nf(t.leads.anuncio)} anúncio · ${nf(t.leads.disparo)} disparo · ${nf(t.leads.pescados)} pescados`, ruim: false },
    { nome: "Atendidos pelo corretor", n: t.atendidos, obs: `${pct(t.atendidos, t.leadsTot)}% dos leads`, ruim: false },
    { nome: "Visitas (C2S)", n: t.visitas, obs: `${nf(t.plantaoDias)} corretor-dias no plantão`, ruim: false },
    { nome: "Pastas novas (Junix)", n: t.pastasNovas, obs: "cadastradas no período", ruim: false },
    { nome: "Vendas (Junix)", n: t.vendas, obs: t.vgv ? `${curto(t.vgv)} em VGV` : "no período", ruim: false },
  ] : [];
  const maxF = Math.max(1, ...funil.map((f) => f.n));

  // pessoas (agora)
  const cors = gerentes.flatMap((g) => g.corretores_lista ?? []);
  const online = cors.filter((c) => c.online).length;
  const logados = cors.filter((c) => s0?.logadosHoje?.[c.id]).length;
  const plantao = cors.filter((c) => c.plantao_hoje).length;
  const semLogin = gerentes.reduce((a, g) => a + (s0?.plantaoSemLogin?.[g.id]?.length ?? 0), 0);
  const nunca = cors.filter((c) => !c.ultimo_acesso).length;

  const gargalo = (l?: LinhaSuper) => {
    if (!l) return null;
    if (l.leadsTot >= 5 && l.atendidos / l.leadsTot < 0.5) return ["ATENDIMENTO", "Metade dos leads nem foi chamada. Cobrar o primeiro contato."];
    if (l.plantaoDias >= 10 && !l.visitas) return ["VISITA", "Tem plantão, mas não vira visita registrada."];
    if (l.visitas >= 3 && !l.vendas) return ["FECHAMENTO", "Tem visita, mas não vira pasta nem venda."];
    if (l.gasto && l.leadsFb && t?.leadsFb && l.gasto / l.leadsFb > 1.5 * (t.gasto / t.leadsFb)) return ["ANÚNCIO", "Lead caro: rever campanhas com o gestor de tráfego."];
    return null;
  };

  return (
    <div className="dir s2-pg">
      <style>{`.mgr10 .s2-pg{min-height:0;background:transparent;display:flex;flex-direction:column;gap:18px;padding:24px 0 48px}
.mgr10 .s2-pg .s2-ger{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.mgr10 .s2-pg .s2-gk{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
.mgr10 .s2-pg .s2-gk div{background:var(--sunk);border-radius:8px;padding:8px 10px}
.mgr10 .s2-pg .s2-gk small{display:block;font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em}
.mgr10 .s2-pg .s2-gk b{font-size:18px}
.mgr10 .s2-pg .s2-pes{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.mgr10 .s2-pg .s2-pad{padding:16px 18px}
.mgr10 .s2-pg .dir-kpi .mono{font-size:20px;white-space:nowrap}
.mgr10 .s2-pg .dir-h{margin-bottom:10px}`}</style>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className="dir-ola" style={{ color: "var(--ink)" }}>
          <small style={{ color: "var(--ink-3)" }}>{supers.length > 1 ? "Diretoria · todas as superintendências" : `Superintendência ${superNome}`} · {nomeMes(inicioMes())} · dia {hoje.getDate()} de {diasMes}</small>
          <b style={{ color: "var(--ink)" }}>{saudacao()}, {superNome.split(" ")[0]}</b>
        </div>
        <SeletorPeriodoSuper p={p} estilo="dir" />
      </div>

      <div className="dir-row2">
        <div>
          <div className="dir-card dir-hero">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="mono dir-hero-n">{realizado}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>vendas em {nomeMes(mes)}</span>
              <span style={{ marginLeft: "auto" }} className="dir-per">
                <button className={desloc === 0 ? "on" : ""} onClick={() => setDesloc(0)}>Este mês</button>
                <button className={desloc === 1 ? "on" : ""} onClick={() => setDesloc(1)}>Próximo</button>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap", fontSize: 14, color: "var(--ink-3)" }}>
              {supers.length > 1 ? "Meta da empresa" : "Meta da superintendência"} <b className="mono" style={{ color: "var(--ink)" }}>{d?.meta ?? "—"}</b>
              {projecao != null && d?.meta ? <span>· no ritmo de hoje fecha em <b style={{ color: "var(--ink)" }}>{projecao}</b></span> : null}
              {projecao != null && d?.meta ? <span className={`dir-chip ${projecao >= d.meta ? "c-grn" : "c-red"}`}>{projecao >= d.meta ? "no ritmo" : "abaixo do ritmo"}</span> : null}
            </div>
            {d?.meta ? <div className="dir-bar" style={{ marginTop: 14 }}><i style={{ width: `${pctMeta}%` }} />{ritmo ? <em style={{ left: `${ritmo}%` }} title="onde deveria estar hoje" /> : null}</div> : null}
            <div className="dir-list" style={{ marginTop: 14 }}>
              {filhos.map((f: any) => (
                <div key={f.id}>
                  <span style={{ flex: 1 }}><b>{f.nome}</b> <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· vendeu <b className="mono" style={{ color: "var(--ink)" }}>{f.realizado}</b>{f.meta ? ` de ${f.meta}` : " · sem meta"}</span></span>
                  {f.pode_editar ? <MetaInput key={`${mes}-${f.id}-${f.meta}`} valor={f.meta} onSalvar={(n) => definir(f.id, n, f.nome)} /> : <b className="mono">{f.meta ?? "—"}</b>}
                </div>
              ))}
              {d?.meta ? <div style={{ fontSize: 13, fontWeight: 600, color: somaFilhos < d.meta ? "var(--red)" : "var(--ink-3)" }}>
                {somaFilhos < d.meta ? `Distribuído ${somaFilhos} de ${d.meta} — faltam ${d.meta - somaFilhos}` : `Distribuído ${somaFilhos} de ${d.meta} ✓`}</div> : null}
            </div>
          </div>
          <div className="dir-kpis">
            <div className="dir-card dir-kpi"><div className="dir-lbl">Vendas no período</div><span className="mono">{t ? nf(t.vendas) : "…"}</span><small>{t?.vgv ? `${curto(t.vgv)} em VGV` : "Junix"}</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Anúncio no período</div><span className="mono">{t ? curto(t.gasto) : "…"}</span>
              <small>{t?.leadsFb ? `${nf(t.leadsFb)} leads · ${brl(t.gasto / t.leadsFb)} cada` : "Facebook"}</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por venda</div><span className="mono">{t?.vendas ? curto(t.gasto / t.vendas) : "—"}</span><small>anúncio ÷ vendas</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Sem nenhum toque</div><span className="mono" style={{ color: "var(--red)" }}>{t ? nf(t.carteiraSemToque) : "…"}</span><small>leads novos, agora</small></div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2.2" aria-hidden><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Decida hoje</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>as {decida.length || "—"} mais caras agora</span>
          </div>
          {carregando || !num ? <div className="dir-card dir-vazio">Calculando…</div> : !decida.length ? <div className="dir-card dir-vazio">Nada urgente agora.</div> : null}
          {decida.map((x) => (
            <div key={x.id} className="dir-card dir-dec">
              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`dir-chip ${x.cls}`}>{x.tipo}</span><span style={{ fontSize: 12, color: "var(--ink-3)" }}>{x.quem}</span></div>
                <div className="dir-dec-t">{x.titulo}</div>
                <div className="dir-dec-p">{x.porque}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {x.acoes.map(([tx, f], j) => <button key={tx} className={`dir-btn${j === 0 ? " solid" : ""}`} onClick={f}>{tx}</button>)}
              </div>
            </div>
          ))}

          <div className="dir-card s2-pad" style={{ marginTop: 14 }}>
            <div className="dir-h"><b>Funil do período</b><span>{p.texto}{isFetching ? " · atualizando…" : ""}</span></div>
            <div className="dir-barras">
              {funil.map((f) => (
                <div key={f.nome} style={{ gridTemplateColumns: "180px 1fr 60px" }}>
                  <span><b>{f.nome}</b><br /><small style={{ color: "var(--ink-3)" }}>{f.obs}</small></span>
                  <div className="tr"><i style={{ width: `${(f.n / maxF) * 100}%` }} /></div>
                  <b className="mono" style={{ textAlign: "right" }}>{nf(f.n)}</b>
                </div>
              ))}
              {!funil.length ? <p className="dir-nota">Calculando…</p> : null}
            </div>
          </div>

          <div className="dir-card s2-pad" style={{ marginTop: 14 }}>
            <div className="dir-h"><b>Pessoas agora</b><span>login no Comandra e ponto no C2S</span></div>
            <div className="s2-pes">
              <div><div className="dir-lbl">Corretores</div><b className="mono" style={{ fontSize: 22 }}>{cors.length}</b></div>
              <div><div className="dir-lbl">Online agora</div><b className="mono" style={{ fontSize: 22 }}>{online}</b></div>
              <div><div className="dir-lbl">Entraram hoje</div><b className="mono" style={{ fontSize: 22 }}>{logados}</b></div>
              <div><div className="dir-lbl">No plantão hoje</div><b className="mono" style={{ fontSize: 22 }}>{plantao}</b></div>
              <div><div className="dir-lbl">Plantão sem login</div><b className="mono" style={{ fontSize: 22, color: semLogin ? "var(--red)" : undefined }}>{semLogin}</b></div>
              <div><div className="dir-lbl">Nunca entraram</div><b className="mono" style={{ fontSize: 22, color: nunca ? "var(--org)" : undefined }}>{nunca}</b></div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="dir-h" style={{ marginBottom: 10 }}><b style={{ fontSize: 17 }}>Suas equipes</b><span>{p.texto} · clique em "Abrir painel" para entrar no gerente</span></div>
        <div className="s2-ger">
          {gerentes.map((g) => {
            const l = linhaDe(g.id);
            const meta = filhos.find((f: any) => f.id === g.id);
            const gg = gargalo(l);
            return (
              <div key={g.id} className="dir-card s2-pad">
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 16 }}>{g.nome}</b>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{g.corretores} corretores · {g.online} online · {g.plantao_hoje} no plantão</span>
                  {gg ? <span className="dir-chip c-red" style={{ marginLeft: "auto" }}>{gg[0]}</span> : <span className="dir-chip c-grn" style={{ marginLeft: "auto" }}>ok</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>Mês: vendeu <b style={{ color: "var(--ink)" }}>{meta?.realizado ?? 0}</b>{meta?.meta ? ` de ${meta.meta}` : " · sem meta"}</div>
                <div className="s2-gk">
                  <div><small>Leads</small><b className="mono">{l?.leadsTot ?? "…"}</b></div>
                  <div><small>Atendidos</small><b className="mono">{l ? `${pct(l.atendidos, l.leadsTot)}%` : "…"}</b></div>
                  <div><small>Sem toque</small><b className="mono" style={{ color: l?.carteiraSemToque ? "var(--red)" : undefined }}>{l?.carteiraSemToque ?? "…"}</b></div>
                  <div><small>Plantão</small><b className="mono">{l?.plantaoDias ?? "…"}</b></div>
                  <div><small>Visitas</small><b className="mono">{l?.visitas ?? "…"}</b></div>
                  <div><small>Vendas</small><b className="mono" style={{ color: l?.vendas ? "var(--grn)" : undefined }}>{l?.vendas ?? "…"}</b></div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  Anúncio: {l?.gasto != null ? `${brl(l.gasto)} · ${l.leadsFb ?? 0} leads${l.leadsFb ? ` · ${brl(l.gasto / l.leadsFb)} cada` : ""}` : "sem conta ligada"}
                </div>
                {gg ? <div className="dir-dec-p" style={{ marginTop: 6 }}>{gg[1]}</div> : null}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="dir-btn solid" onClick={() => onAbrir(g.id)}>Abrir painel</button>
                  {gg ? <button className="dir-btn" onClick={() => cobrar(g.id, g.nome, `gargalo: ${gg[0].toLowerCase()}`, `${g.nome}, olhando ${p.texto}: ${gg[1]} Como vamos resolver essa semana?`)}>Cobrar {g.nome}</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetaInput({ valor, onSalvar }: { valor: number | null; onSalvar: (n: number) => void }) {
  const [v, setV] = useState(valor != null ? String(valor) : "");
  return (
    <input className="dir-meta-in mono" inputMode="numeric" value={v} placeholder="meta" aria-label="Meta de vendas"
      onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
      onBlur={() => { const n = Number(v); if (v !== "" && n !== valor) onSalvar(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
