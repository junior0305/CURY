/* Tela do diretor — porte do protótipo aprovado (Desktop.dc.html), com dado real.
 * Hoje: meta em cascata, "decida hoje", pessoas, funil, cobranças.
 * Equipes / Leads / Pastas: árvore que abre superintendência → gerente → corretor.
 * Gastos: anúncio real por equipe; plano e outros gastos chegam na próxima entrega. */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useConsolidadoSuper, type LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import { useDiretorId, useDiretoria, useMetasDiretoria, donoJunix, chaveGerente,
  type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";
import Estrategia from "@/components/estrategia/Estrategia";
import EquipesCards from "@/components/diretoria/EquipesCards";
import BiTab from "@/components/manager-v10/BiTab";
import PastasPainel from "@/components/diretoria/PastasPainel";
import { lerPastas, resumoPastas } from "@/components/diretoria/pastasAnalise";
import { usePlanos, atrasada } from "@/hooks/usePlano";
import "@/styles/diretoria.css";

type Aba = "hoje" | "equipes" | "leads" | "pastas" | "bi" | "estrategia";
const ABAS: [Aba, string][] = [["hoje", "Hoje"], ["equipes", "Equipes"], ["leads", "Leads e investimento"], ["pastas", "Pastas"], ["bi", "B.I."], ["estrategia", "Estratégia"]];
const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "7 dias"], [30, "30 dias"]];

const nf = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const curto = (n: number) => n >= 1e6 ? `R$ ${(n / 1e6).toFixed(2).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${(n / 1e3).toFixed(1).replace(".", ",")} mil` : n ? brl(n) : "—";
const Z = ({ n, fmt = nf, cls }: { n: number | null | undefined; fmt?: (n: number) => string; cls?: string }) =>
  n ? <span className={cls}>{fmt(n)}</span> : <span className="z">—</span>;
const inicioMes = (desloc = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10); };
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

function linhaVazia(id: string, nome: string): LinhaConsolidado {
  return { id, nome, plantaoDias: 0, visitas: 0, vendas: 0, vgv: 0, pastas: 0, pastasTravadas: 0, gasto: null, leadsFb: null,
    leads: { anuncio: 0, disparo: 0, pescados: 0, outros: 0 }, nuncaFalaram: 0 };
}
function somar(nome: string, ls: LinhaConsolidado[]): LinhaConsolidado {
  const t = linhaVazia("soma", nome);
  for (const l of ls) {
    t.plantaoDias += l.plantaoDias; t.visitas += l.visitas; t.vendas += l.vendas; t.vgv += l.vgv;
    t.pastas += l.pastas; t.pastasTravadas += l.pastasTravadas; t.nuncaFalaram += l.nuncaFalaram;
    if (l.gasto != null) t.gasto = (t.gasto ?? 0) + l.gasto;
    if (l.leadsFb != null) t.leadsFb = (t.leadsFb ?? 0) + l.leadsFb;
    for (const k of Object.keys(t.leads) as (keyof LinhaConsolidado["leads"])[]) t.leads[k] += l.leads[k];
  }
  return t;
}
const totLeads = (l: LinhaConsolidado) => l.leads.anuncio + l.leads.disparo + l.leads.pescados + l.leads.outros;

function Seta({ on }: { on: boolean }) { return <span className={`dir-seta${on ? " on" : ""}`} aria-hidden>▸</span>; }

export default function Diretoria() {
  const { session, role } = useAuth();
  const nav = useNavigate();
  const [aba, setAba] = useState<Aba>("hoje");
  const [dias, setDias] = useState(30);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const tog = (k: string) => setAberto((v) => ({ ...v, [k]: !v[k] }));
  const abrirPainel = (id: string) => nav(`/manager?manager=${id}`);

  const { data: diretorId } = useDiretorId(role, session?.user?.id);
  const { data: dir, isLoading, isPlaceholderData: dirVelho } = useDiretoria(diretorId, dias);
  const { data: cons, isLoading: carregandoCons, isPlaceholderData: consVelho } = useConsolidadoSuper(diretorId ?? undefined, dias);
  const atualizando = dirVelho || consVelho;

  const porId = useMemo(() => new Map((cons?.linhas ?? []).map((l) => [l.id, l])), [cons]);
  const supers = dir?.supers ?? [];
  // linhas do consolidado de cada super: gerentes + "direto com o super" + "sem gerente no Comandra"
  const linhasDoSuper = (s: SuperDiretoria) => [
    ...s.gerentes.map((g) => porId.get(g.id) ?? linhaVazia(g.id, g.nome)),
    ...(porId.get(s.id) ? [{ ...porId.get(s.id)!, nome: `Direto com ${s.nome}` }] : []),
    ...(porId.get(`outros:${s.id}`) ? [porId.get(`outros:${s.id}`)!] : []),
  ];
  const totalEmpresa = cons ? somar("Empresa", cons.linhas) : null;

  const primeiroNome = (session?.user?.user_metadata as any)?.first_name || "Junior";
  const hojeD = new Date();
  const diasMes = new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0).getDate();

  return (
    <div className="dir">
      <header className="dir-top">
        <div className="dir-logo">C</div>
        <div className="dir-ola">
          <small>Diretoria · {nomeMes(inicioMes())} · dia {hojeD.getDate()} de {diasMes}</small>
          <b>{saudacao()}, {String(primeiroNome).split(" ")[0]}</b>
        </div>
        <nav className="dir-nav" aria-label="Seções">
          {ABAS.map(([k, t]) => <button key={k} className={aba === k ? "on" : ""} aria-current={aba === k ? "page" : undefined} onClick={() => setAba(k)}>{t}</button>)}
        </nav>
        {role === "ADMIN" ? <Link to="/admin" className="dir-ghost">Admin</Link> : null}
        <Link to="/super?aba=time" className="dir-ghost" title="Tela anterior, com cadastro e desligamento">Gestão do time</Link>
      </header>

      <main className="dir-wrap">
        {aba !== "hoje" && aba !== "estrategia" && aba !== "pastas" && aba !== "bi" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="dir-lbl">Período</span>
            <div className="dir-per">{PERIODOS.map(([n, t]) => <button key={n} className={dias === n ? "on" : ""} onClick={() => setDias(n)}>{t}</button>)}</div>
            {atualizando ? <span className="dir-chip c-blue">atualizando para {PERIODOS.find(([n]) => n === dias)?.[1] ?? `${dias} dias`}…</span>
              : <span className="dir-nota">{aba === "equipes" ? "O período muda plantões, visitas e pastas; vendas e meta são sempre do mês." : "Clique na superintendência para abrir os gerentes; no gerente para abrir os corretores."}</span>}
          </div>
        ) : null}

        {isLoading || !dir ? <div className="dir-card dir-vazio">Juntando C2S, Junix, Facebook e Comandra…</div> : (
          <>
            {aba === "hoje" && <Hoje diretorId={diretorId!} supers={supers} total={totalEmpresa} cons={cons?.linhas ?? []}
              carregandoCons={carregandoCons} plantaoHojeTotal={dir.plantaoHojeTotal} cobrancas={dir.cobrancas} pastas={dir.pastas}
              irPara={(a, k) => { setAba(a); if (k) setAberto((v) => ({ ...v, [k]: true })); }} abrirPainel={abrirPainel} />}
            {aba === "equipes" && <>
              <EquipesCards diretorId={diretorId!} supers={supers} linhasDoSuper={linhasDoSuper} dias={dias} carregandoCons={carregandoCons} abrirPainel={abrirPainel} />
              <button className="dir-btn" style={{ alignSelf: "flex-start" }} onClick={() => tog("tabela-equipes")}>
                {aberto["tabela-equipes"] ? "▾ Esconder a tabela completa" : "▸ Tabela completa, corretor por corretor (login, online, plantão)"}</button>
              {aberto["tabela-equipes"] ? <Equipes supers={supers} linhasDoSuper={linhasDoSuper} aberto={aberto} tog={tog} abrirPainel={abrirPainel} carregandoCons={carregandoCons} /> : null}
            </>}
            {aba === "leads" && <Leads dias={dias} supers={supers} linhasDoSuper={linhasDoSuper} total={totalEmpresa} aberto={aberto} tog={tog} abrirPainel={abrirPainel} carregandoCons={carregandoCons} />}
            {aba === "pastas" && <>
              <PastasPainel diretorId={diretorId!} supers={supers} pastas={dir.pastas} />
              <button className="dir-btn" style={{ alignSelf: "flex-start" }} onClick={() => tog("tabela-pastas")}>
                {aberto["tabela-pastas"] ? "▾ Esconder a árvore completa" : "▸ Árvore completa: super → gerente → corretor → cliente"}</button>
              {aberto["tabela-pastas"] ? <Pastas supers={supers} pastas={dir.pastas} aberto={aberto} tog={tog} /> : null}
            </>}
            {aba === "bi" && <BiTab scope="super" managerId={diretorId ?? undefined} />}
            {aba === "estrategia" && diretorId && <Estrategia diretorId={diretorId} supers={supers} pastas={dir.pastas} />}
          </>
        )}
        <p className="dir-nota">Fontes: Junix (venda, VGV, pastas) · C2S (plantão, visita) · Facebook (anúncio) · Comandra (leads, login).</p>
      </main>
    </div>
  );
}

/* Contrato emitido no Junix ainda não é venda (venda = "Venda Confirmada"): é a venda quase fechada,
   que o diretor precisa ver e cobrar. Também chega no WhatsApp dele (/root/econ/alerta_contratos.py). */
const titulo = (t: string | null) => (t ?? "—").replace(/\s+BN\s*$/i, "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
function ContratosEmitidos({ pastas, supers }: { pastas: PastaJunix[]; supers: SuperDiretoria[] }) {
  const lista = pastas.filter((p) => p.etapa === "Emissão").sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
  if (!lista.length) return null;
  const nomeSuper = (p: PastaJunix) => supers.find((s) => s.id === donoJunix(supers, p.superintendente, p.gerente).superId)?.nome ?? titulo(p.superintendente);
  return (
    <div className="dir-card" style={{ padding: 16, marginTop: 12, borderColor: "var(--teal)" }}>
      <div className="dir-h" style={{ marginBottom: 8 }}>
        <b>Contratos emitidos aguardando virar venda ({lista.length})</b>
        <span>venda quase fechada · só conta no placar quando o Junix confirmar a venda</span>
      </div>
      <div className="dir-list">
        {lista.map((p) => (
          <div key={p.proposta_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <b>{titulo(p.cliente)}</b> <span className="dir-nota">· {titulo(p.empreendimento).replace(/^Condomínio\s+/i, "")}</span>
              <div className="dir-nota">{titulo(p.corretor)} · gerente {titulo(p.gerente)} · {nomeSuper(p)}</div>
            </div>
            <span className={`dir-chip ${(p.dias ?? 0) >= 5 ? "c-red" : (p.dias ?? 0) >= 2 ? "c-org" : "c-blue"}`}>
              {(p.dias ?? 0) === 0 ? "emitido hoje" : `${p.dias} dia${p.dias === 1 ? "" : "s"} parado`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Cobranças da semana por quem cobra: cobrou quantas vezes, o corretor respondeu, o lead andou depois?
   E quem tem lead sem toque e não cobrou ninguém. Lista crua não decide nada; o resumo diz quem cobra e se funciona. */
function CobrancasResumo({ cobrancas, supers, cons }: { cobrancas: import("@/hooks/useDiretoria").Cobranca[]; supers: SuperDiretoria[]; cons: LinhaConsolidado[] }) {
  const por = new Map<string, { nome: string; n: number; resp: number; leads: number; atend: number }>();
  for (const c of cobrancas) {
    const x = por.get(c.de_id) ?? { nome: c.de, n: 0, resp: 0, leads: 0, atend: 0 };
    x.n++; if (c.respondida_em) x.resp++; x.leads += c.leads; x.atend += c.atendidos;
    por.set(c.de_id, x);
  }
  const linhas = [...por.values()].sort((a, b) => b.n - a.n);
  const semResp = cobrancas.filter((c) => !c.respondida_em);
  const inativos = [...new Map(cobrancas.filter((c) => !c.para_ativo && c.para_ainda_tem).map((c) => [c.para_id, c.para])).values()];
  const cobraram = new Set(cobrancas.map((c) => c.de_id));
  const naoCobram = supers.flatMap((s) => s.gerentes).map((g) => ({ g, l: cons.find((x) => x.id === g.id) }))
    .filter(({ g, l }) => !cobraram.has(g.id) && (l?.nuncaFalaram ?? 0) >= 5)
    .sort((a, b) => (b.l?.nuncaFalaram ?? 0) - (a.l?.nuncaFalaram ?? 0));
  return (
    <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="dir-h"><b>Cobranças · 7 dias</b><span>quem cobra, se o corretor responde e se o lead anda depois</span></div>
      {!linhas.length ? <span className="dir-nota">Ninguém cobrou corretor nos últimos 7 dias.</span> : (
        <div className="dir-tree" style={{ margin: "0 -18px" }}>
          <table>
            <thead><tr><th>Quem cobrou</th><th>Cobranças</th><th>Responderam</th><th>Leads cobrados</th><th>Atendidos depois</th></tr></thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.nome} className="n1">
                  <td>{x.nome}</td><td>{x.n}</td>
                  <td><span className={x.resp < x.n ? "r" : "g"}>{x.resp} de {x.n}</span></td>
                  <td>{x.leads || "—"}</td>
                  <td>{x.leads ? <span className={x.atend < x.leads ? "r" : "g"}>{x.atend} de {x.leads}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {semResp.length ? <div className="dir-nota"><b style={{ color: "var(--red)" }}>Sem resposta:</b> {semResp.slice(0, 6).map((c) => `${c.para} (cobrado por ${c.de})`).join(" · ")}</div> : null}
      {inativos.length ? <div className="dir-nota"><b style={{ color: "var(--org)" }}>Conta desativada, mas ainda com leads:</b> {inativos.join(", ")}. Reative ou passe os leads para quem está ativo.</div> : null}
      {naoCobram.length ? <div className="dir-nota"><b style={{ color: "var(--red)" }}>Têm lead sem toque e não cobraram ninguém:</b> {naoCobram.slice(0, 6).map(({ g, l }) => `${g.nome} (${l?.nuncaFalaram} sem toque)`).join(" · ")}</div> : null}
    </div>
  );
}

/* ───────────────────────── HOJE ───────────────────────── */
function MetaInput({ valor, onSalvar }: { valor: number | null; onSalvar: (n: number) => void }) {
  const [txt, setTxt] = useState(valor == null ? "" : String(valor));
  const salvar = () => { const n = parseInt(txt, 10); if (!Number.isNaN(n) && n !== valor) onSalvar(n); };
  return <input className="dir-meta-in" type="number" min={0} inputMode="numeric" value={txt} placeholder="—" aria-label="meta de vendas"
    onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function Hoje({ diretorId, supers, total, cons, carregandoCons, plantaoHojeTotal, cobrancas, pastas, irPara, abrirPainel }: {
  diretorId: string; supers: SuperDiretoria[]; total: LinhaConsolidado | null; cons: LinhaConsolidado[]; carregandoCons: boolean;
  plantaoHojeTotal: number; cobrancas: import("@/hooks/useDiretoria").Cobranca[]; pastas: PastaJunix[];
  irPara: (a: Aba, k?: string) => void; abrirPainel: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [desloc, setDesloc] = useState(0);
  const mes = inicioMes(desloc);
  const { data: metas } = useMetasDiretoria(diretorId, mes);
  const { data: planosMes } = usePlanos(inicioMes());

  // Modal de cobrança direta
  const [modalCobranca, setModalCobranca] = useState<{
    destinatarioNome: string;
    destinatarioId: string;
    telefone: string | null;
    motivo: string;
    mensagem: string;
    decId?: string;
  } | null>(null);

  // Micro-UX: anomalias do Decida Hoje tratadas/resolvidas na sessão
  const [resolvidosHoje, setResolvidosHoje] = useState<Set<string>>(() => new Set());
  const alternarResolvido = (id: string) => {
    setResolvidosHoje((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function definir(id: string, n: number, nome: string) {
    const { error } = await supabase.rpc("definir_meta" as any, { p_mes: mes, p_dono: id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${nome} em ${nomeMes(mes)}: ${n} venda${n === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  }

  async function dispararCobranca(destId: string, destNome: string, motivo: string, mensagem: string, telefone: string | null, decId?: string) {
    try {
      await supabase.from("cobrancas" as any).insert({
        de_id: diretorId,
        para_id: destId,
        motivo,
        canal: "whatsapp",
        enviada_em: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["diretoria"] });
      toast.success(`Cobrança registrada para ${destNome}!`);

      if (decId) {
        setResolvidosHoje((prev) => {
          const next = new Set(prev);
          next.add(decId);
          return next;
        });
      }

      if (telefone) {
        const cleanPhone = telefone.replace(/\D/g, "");
        const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(mensagem)}`;
        window.open(url, "_blank");
      } else {
        toast.info(`${destNome} não possui telefone cadastrado. Cobrança salva apenas no histórico interno.`);
      }
    } catch (err: any) {
      toast.error("Erro ao registrar cobrança: " + err.message);
    } finally {
      setModalCobranca(null);
    }
  }

  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const d = metas?.dono;
  const realizado = d?.realizado ?? 0;
  const projecao = desloc === 0 ? Math.round((realizado / Math.max(1, hoje.getDate())) * diasMes) : null;
  const pct = d?.meta ? Math.min(100, (realizado / d.meta) * 100) : 0;
  const ritmo = desloc === 0 ? (hoje.getDate() / diasMes) * 100 : 0;
  const somaSupers = (metas?.filhos ?? []).reduce((a, f) => a + (f.meta ?? 0), 0);

  // Pipeline de pastas (Junix): mesma leitura da aba Pastas — só pasta viva, chance por etapa
  const rp = useMemo(() => resumoPastas(lerPastas(pastas)), [pastas]);
  const projecaoPipeline = Math.round(realizado + rp.previsao);

  // pessoas
  const gerentes = supers.flatMap((s) => s.gerentes.map((g) => ({ s, g })));
  const corretores = gerentes.flatMap(({ s, g }) => g.corretores_lista.map((c) => ({ s, g, c })));
  const online = corretores.filter((x) => x.c.online).length;
  const logados = corretores.filter((x) => x.s.logadosHoje[x.c.id]).length;
  const plantaoComLogin = corretores.filter((x) => x.c.plantao_hoje).length;
  const semLogin = gerentes.reduce((a, { s, g }) => a + (s.plantaoSemLogin[g.id]?.length ?? 0), 0);
  const nuncaEntraram = corretores.filter((x) => !x.c.ultimo_acesso).length;

  // decida hoje: as 3 coisas mais caras agora, do dado
  type Dec = { id: string; cls: string; tipo: string; quem: string; titulo: string; porque: string; acoes: [string, () => void][] };
  const decs: (Dec & { peso: number })[] = [];
  for (const { s, g } of gerentes) {
    const l = cons.find((x) => x.id === g.id);
    if (l && l.nuncaFalaram >= 10) {
      const decId = `leads-sem-toque:${g.id}`;
      decs.push({
        id: decId,
        peso: l.nuncaFalaram,
        cls: "c-red",
        tipo: "dinheiro na mesa",
        quem: `${s.nome} › ${g.nome}`,
        titulo: `${nf(l.nuncaFalaram)} leads na equipe do ${g.nome} sem nenhum toque`,
        porque: "Lead pago parado na mão do corretor — esfria em 2 dias.",
        acoes: [
          [`📱 Cobrar ${s.nome}`, () => setModalCobranca({
            destinatarioNome: s.nome,
            destinatarioId: s.id,
            telefone: s.phone ?? null,
            motivo: `${nf(l.nuncaFalaram)} leads sem toque na equipe do ${g.nome}`,
            mensagem: `Fala ${s.nome}, no Comandra constam ${nf(l.nuncaFalaram)} leads pagos da equipe do ${g.nome} sem nenhum toque do corretor. Dinheiro de mídia esfria em 48h. Por favor, alinhe com o ${g.nome} para rodar a roleta ou redistribuir hoje antes das 14h.`,
            decId
          })],
          [`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)],
          ["Ver leads", () => irPara("leads", `s:${s.id}`)]
        ]
      });
    }
    const sl = s.plantaoSemLogin[g.id]?.length ?? 0;
    if (sl >= 2) {
      const decId = `sem-login:${g.id}`;
      decs.push({
        id: decId,
        peso: sl * 8,
        cls: "c-red",
        tipo: "equipe invisível",
        quem: `${s.nome} › ${g.nome}`,
        titulo: `${sl} corretores do ${g.nome} no plantão hoje sem login no Comandra`,
        porque: "Estão trabalhando, mas não recebem lead nem aparecem nos números.",
        acoes: [
          [`📱 Cobrar ${s.nome}`, () => setModalCobranca({
            destinatarioNome: s.nome,
            destinatarioId: s.id,
            telefone: s.phone ?? null,
            motivo: `${sl} corretores do ${g.nome} no plantão sem login`,
            mensagem: `Fala ${s.nome}, verifiquei no Comandra que há ${sl} corretores do ${g.nome} no plantão pelo C2S hoje sem login no Comandra. Estão atendendo mas invisíveis para a distribuição. Pode acionar o ${g.nome} para cobrar o login da equipe agora?`,
            decId
          })],
          ["Ver nomes", () => irPara("equipes", `s:${s.id}`)],
          [`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)]
        ]
      });
    }
    if (l && l.plantaoDias >= 15 && l.visitas === 0) {
      const decId = `plantao-sem-visita:${g.id}`;
      decs.push({
        id: decId,
        peso: l.plantaoDias,
        cls: "c-gray",
        tipo: "plantão sem visita",
        quem: `${s.nome} › ${g.nome}`,
        titulo: `${g.nome}: ${l.plantaoDias} dias de plantão e nenhuma visita registrada`,
        porque: "Ou a visita não está sendo lançada no C2S, ou o plantão não converte.",
        acoes: [
          [`📱 Cobrar ${s.nome}`, () => setModalCobranca({
            destinatarioNome: s.nome,
            destinatarioId: s.id,
            telefone: s.phone ?? null,
            motivo: `${g.nome}: ${l.plantaoDias} dias de plantão e zero visitas no C2S`,
            mensagem: `Fala ${s.nome}, a equipe do ${g.nome} acumulou ${l.plantaoDias} dias de plantão no C2S mas nenhuma visita lançada. Ou não estão cadastrando atendimento ou a conversão de plantão está travada. Como está essa cobrança?`,
            decId
          })],
          [`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)],
          ["Ver equipe", () => irPara("equipes", `s:${s.id}`)]
        ]
      });
    }
  }
  const travadas = pastas.filter((p) => (p.dias ?? 0) >= 7).length;
  if (travadas >= 3) {
    decs.push({
      id: "pastas-travadas",
      peso: travadas * 3,
      cls: "c-red",
      tipo: "pasta parada",
      quem: "empresa toda",
      titulo: `${travadas} pastas paradas há 7 dias ou mais no Junix`,
      porque: "Venda quase feita que pode cair — cobre o superintendente de cada uma.",
      acoes: [["Ver pastas", () => irPara("pastas")]]
    });
  }
  const atrasadasPlano = (planosMes ?? []).flatMap((p) => p.acoes.filter(atrasada));
  if (atrasadasPlano.length) {
    decs.push({
      id: "plano-atrasado",
      peso: 1000 + atrasadasPlano.length,
      cls: "c-red",
      tipo: "plano atrasado",
      quem: "plano estratégico",
      titulo: `${atrasadasPlano.length} ${atrasadasPlano.length === 1 ? "ação do plano passou" : "ações do plano passaram"} do prazo`,
      porque: "O Jarvis já cobra os responsáveis às 9h — veja quem e decida se ajusta o prazo ou o responsável.",
      acoes: [["Ver estratégia", () => irPara("estrategia")]]
    });
  }
  const decida = decs.sort((a, b) => b.peso - a.peso).slice(0, 3);

  const leadsTot = total ? totLeads(total) : 0;
  const funil = total ? [
    { nome: "Leads que entraram", n: leadsTot, obs: "anúncio, disparo, pescados e outros", ruim: false },
    { nome: "Sem nenhum toque do corretor", n: total.nuncaFalaram, obs: "carteira ativa que ninguém tocou — o vazamento", ruim: true },
    { nome: "Visitas (C2S)", n: total.visitas, obs: "cliente atendido no estande", ruim: false },
    { nome: "Pastas abertas (Junix)", n: total.pastas, obs: "agora", ruim: false },
    { nome: "Vendas (Junix)", n: total.vendas, obs: "no período", ruim: false },
  ] : [];
  const maxF = Math.max(1, ...funil.map((f) => f.n));

  return (
    <>
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
              Meta da empresa {d?.pode_editar ? <MetaInput key={`${mes}-${d.meta}`} valor={d.meta} onSalvar={(n) => definir(d.id, n, "a empresa")} /> : <b className="mono">{d?.meta ?? "—"}</b>}
              {projecao != null && d?.meta ? <span>· ritmo linear fecha em <b style={{ color: "var(--ink)" }}>{projecao}</b></span> : null}
              {projecao != null && d?.meta ? <span className={`dir-chip ${projecao >= d.meta ? "c-grn" : "c-red"}`}>{projecao >= d.meta ? "no ritmo" : "abaixo do ritmo"}</span> : null}
            </div>
            {d?.meta ? <div className="dir-bar" style={{ marginTop: 14 }}><i style={{ width: `${pct}%` }} />{ritmo ? <em style={{ left: `${ritmo}%` }} title="onde deveria estar hoje" /> : null}</div> : null}

            {/* Projeção Realista por Estoque de Pastas Junix */}
            {desloc === 0 && d?.meta ? (
              <div className="dir-pipeline-card">
                <div className="dir-pipeline-title">
                  <span>📊 <b>Projeção Realista por Pipeline (Estoque Junix)</b></span>
                  <span className={`dir-chip ${projecaoPipeline >= d.meta ? "c-grn" : "c-red"}`}>
                    {projecaoPipeline >= d.meta ? "Estoque Sustenta a Meta" : "Estoque Insuficiente"}
                  </span>
                </div>
                <div className="dir-pipeline-grid">
                  <div className="dir-pipeline-item">
                    <small>Vendas Feitas</small>
                    <b>{realizado}</b>
                  </div>
                  {([["Reta final", rp.reta], ["Análise e documentos", rp.meio], ["Cadastro e unidade", rp.comeco]] as const).map(([t, g]) => (
                    <div key={t} className="dir-pipeline-item">
                      <small>{t}</small>
                      <b>{g.n} <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400 }}>(~{(Math.round(g.prev * 10) / 10).toLocaleString("pt-BR")})</span></b>
                    </div>))}
                  <div className="dir-pipeline-item" style={{ background: "#EEF4F8" }}>
                    <small>Potencial Fechamento</small>
                    <b style={{ color: "var(--teal)" }}>{projecaoPipeline} <span style={{ fontSize: 11, fontWeight: 500 }}>vendas</span></b>
                  </div>
                </div>
                <p className="dir-nota" style={{ marginTop: 8, marginBottom: 0 }}>
                  Regra de 3 aritmética projeta <b>{projecao ?? "—"}</b> vendas. Das <b>{rp.total}</b> pastas no Junix, <b>{rp.vivas}</b> estão vivas ({rp.duplicadas} duplicadas, {rp.reprovadas} reprovadas e {rp.mortas} paradas há 60+ dias ficam fora da conta); com as vendas feitas, o mês fecha perto de <b>{projecaoPipeline}</b>.
                  {projecaoPipeline < d.meta ? (
                    <span style={{ color: "var(--red)", fontWeight: 700, display: "block", marginTop: 3 }}>
                      ⚠️ Déficit de {d.meta - projecaoPipeline} vendas: injete novas pastas na esteira de crédito para não perder a meta.
                    </span>
                  ) : (
                    <span style={{ color: "var(--grn)", fontWeight: 700, display: "block", marginTop: 3 }}>
                      ✓ O volume de crédito em esteira é suficiente para fechar a meta do mês se não houver destrato.
                    </span>
                  )}
                </p>
              </div>
            ) : null}

            <div className="dir-list" style={{ marginTop: 14 }}>
              {(metas?.filhos ?? []).map((f) => (
                <div key={f.id}>
                  <span style={{ flex: 1 }}><b>{f.nome}</b> <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· vendeu <b className="mono" style={{ color: "var(--ink)" }}>{f.realizado}</b>{f.meta ? ` de ${f.meta}` : " · sem meta"}</span></span>
                  {f.pode_editar ? <MetaInput key={`${mes}-${f.id}-${f.meta}`} valor={f.meta} onSalvar={(n) => definir(f.id, n, f.nome)} /> : <b className="mono">{f.meta ?? "—"}</b>}
                </div>
              ))}
              {d?.meta ? <div style={{ fontSize: 13, fontWeight: 600, color: somaSupers < d.meta ? "var(--red)" : "var(--ink-3)" }}>
                {somaSupers < d.meta ? `Distribuído ${somaSupers} de ${d.meta} — faltam ${d.meta - somaSupers}` : `Distribuído ${somaSupers} de ${d.meta} ✓`} · cada super distribui para os gerentes</div> : null}
            </div>
          </div>
          <div className="dir-kpis">
            <div className="dir-card dir-kpi"><div className="dir-lbl">VGV 30d</div><span className="mono">{total ? curto(total.vgv) : "…"}</span><small>Junix</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Anúncio 30d</div><span className="mono">{total ? curto(total.gasto ?? 0) : "…"}</span>
              <small>{total?.leadsFb ? `${nf(total.leadsFb)} leads · ${brl((total.gasto ?? 0) / total.leadsFb)} cada` : carregandoCons ? "carregando…" : "—"}</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por venda</div><span className="mono">{total?.vendas ? brl((total.gasto ?? 0) / total.vendas) : "—"}</span><small>anúncio ÷ vendas</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Sem nenhum toque</div><span className="mono" style={{ color: "var(--red)" }}>{total ? nf(total.nuncaFalaram) : "…"}</span><small>carteira ativa</small></div>
          </div>
          <ContratosEmitidos pastas={pastas} supers={supers} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2.2" aria-hidden><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Decida hoje</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>as {decida.length || "—"} mais caras agora — o resto pode esperar</span>
          </div>

          {decida.length > 0 && decida.every((d) => resolvidosHoje.has(d.id)) && (
            <div className="dir-missao-cumprida">
              <div className="dir-missao-icon">🎉</div>
              <div className="dir-missao-info">
                <b>Missão Cumprida! Gargalos críticos destravados hoje.</b>
                <span>Todas as pendências urgentes da manhã foram alinhadas e cobradas. Sua diretoria está blindada.</span>
              </div>
            </div>
          )}

          {carregandoCons && !decida.length ? <div className="dir-card dir-vazio">Calculando…</div> : null}
          {!carregandoCons && !decida.length ? <div className="dir-card dir-vazio">Nada urgente agora.</div> : null}
          {decida.map((x) => {
            const resolvido = resolvidosHoje.has(x.id);
            return (
              <div key={x.id} className={`dir-card dir-dec${resolvido ? " resolvido" : ""}`}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {resolvido ? (
                      <span className="dir-chip c-grn">✓ Cobrança realizada</span>
                    ) : (
                      <span className={`dir-chip ${x.cls}`}>{x.tipo}</span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{x.quem}</span>
                  </div>
                  <div className="dir-dec-t">{x.titulo}</div>
                  <div className="dir-dec-p">{x.porque}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {resolvido ? (
                    <button className="dir-btn" style={{ fontSize: 12, padding: "5px 10px", minHeight: 32 }} onClick={() => alternarResolvido(x.id)}>
                      Desfazer
                    </button>
                  ) : (
                    <>
                      {x.acoes.map(([t, f], j) => (
                        <button key={t} className={`dir-btn${j === 0 ? " solid" : ""}`} onClick={f}>{t}</button>
                      ))}
                      <button
                        className="dir-btn"
                        style={{ fontSize: 12, padding: "6px 10px", color: "var(--ink-3)" }}
                        title="Marcar como resolvido sem disparar mensagem"
                        onClick={() => alternarResolvido(x.id)}
                      >
                        ✓ Marcar feito
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          <div className="dir-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Pessoas hoje</div>
            <div className="dir-list">
              {[
                [corretores.length, "var(--ink)", "corretores ativos no Comandra"],
                [plantaoHojeTotal, "var(--teal)", "no plantão hoje (check-in C2S)"],
                [logados, "var(--teal)", "entraram no Comandra hoje"],
                [online, "var(--grn)", "online agora"],
                [semLogin, semLogin ? "var(--red)" : "var(--ink-3)", "no plantão hoje sem login no Comandra"],
                [nuncaEntraram, nuncaEntraram ? "var(--org)" : "var(--ink-3)", "corretores nunca entraram"],
              ].map(([n, cor, t]) => (
                <div key={t as string}><span className="mono" style={{ fontSize: 20, fontWeight: 700, width: 52, color: cor as string }}>{n as number}</span><span style={{ flex: 1, fontSize: 13.5 }}>{t as string}</span></div>
              ))}
            </div>
            <button className="dir-btn" style={{ marginTop: 10 }} onClick={() => irPara("equipes")}>Ver por equipe</button>
          </div>
        </div>
      </div>

      {/* ── SCORECARD EXECUTIVO DAS 4 SUPERINTENDÊNCIAS ── */}
      <div className="dir-card dir-scorecard-card">
        <div className="dir-h" style={{ marginBottom: 14 }}>
          <b>Scorecard Executivo das Superintendências</b>
          <span>Comparativo lado a lado de metas, VGV, capacidade produtiva da tropa e pastas travadas</span>
        </div>

        {/* Versão Desktop: Tabela Analítica Completa */}
        <table className="dir-scorecard-table">
          <thead>
            <tr>
              <th>Superintendência</th>
              <th>Meta / Realizado</th>
              <th>% Meta</th>
              <th>VGV 30d</th>
              <th>Ativação da Tropa</th>
              <th>Mídia Facebook</th>
              <th>Custo/Venda</th>
              <th>Pastas Travadas (7d+)</th>
              <th>Saúde</th>
              <th>Ação Direta</th>
            </tr>
          </thead>
          <tbody>
            {supers.map((s) => {
              const ls = cons.filter((l) => s.gerentes.some((g) => g.id === l.id) || l.id === s.id || l.id === `outros:${s.id}`);
              const t = somar(s.nome, ls);
              const f = (metas?.filhos ?? []).find((x) => x.id === s.id);
              const metaQtd = f?.meta ?? 0;
              const pctMeta = metaQtd ? Math.round((f?.realizado ?? t.vendas) / metaQtd * 100) : null;

              // Ativação da tropa: corretores que venderam pelo menos 1 unidade
              const todosCorret = s.gerentes.flatMap((g) => g.corretores_lista);
              const ativosComVenda = todosCorret.filter((c) => (c.vendas_mes ?? 0) > 0).length;
              const pctAtivacao = todosCorret.length ? Math.round((ativosComVenda / todosCorret.length) * 100) : 0;

              // Pastas do super
              const pastasDoSuper = pastas.filter((p) => donoJunix(supers, p.superintendente, p.gerente).superId === s.id);
              const travadasSuper = pastasDoSuper.filter((p) => (p.dias ?? 0) >= 7).length;

              // Facebook e Custo por venda
              const gastoSuper = t.gasto ?? 0;
              const custoPorVenda = t.vendas && gastoSuper ? Math.round(gastoSuper / t.vendas) : null;

              // Indicador de Saúde Executivo
              let saudeCls = "dir-health-green";
              let saudeTxt = "🟢 Alta";
              if ((pctMeta != null && pctMeta < 50 && hoje.getDate() > 15) || travadasSuper >= 6 || (pctAtivacao < 20 && todosCorret.length > 5)) {
                saudeCls = "dir-health-red";
                saudeTxt = "🔴 Crítica";
              } else if ((pctMeta != null && pctMeta < 70 && hoje.getDate() > 10) || travadasSuper >= 3 || pctAtivacao < 35) {
                saudeCls = "dir-health-yellow";
                saudeTxt = "🟡 Atenção";
              }

              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.nome}</b>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      {s.gerentes.length} gerentes · {todosCorret.length} corretores
                    </div>
                  </td>
                  <td>
                    <b>{f?.realizado ?? t.vendas}</b> / {metaQtd || "—"}
                  </td>
                  <td>
                    {pctMeta != null ? (
                      <div className="dir-cell-progress">
                        <span className={`dir-chip ${pctMeta >= 100 ? "c-grn" : pctMeta >= 65 ? "c-blue" : "c-red"}`}>
                          {pctMeta}%
                        </span>
                        <div className="dir-micro-bar">
                          <i
                            className={pctMeta >= 100 ? "ok" : pctMeta >= 65 ? "" : "crit"}
                            style={{ width: `${Math.min(100, pctMeta)}%` }}
                          />
                        </div>
                      </div>
                    ) : <span className="z">—</span>}
                  </td>
                  <td>
                    <b>{curto(t.vgv)}</b>
                  </td>
                  <td>
                    <div className="dir-cell-progress">
                      <div>
                        <span>{ativosComVenda} de {todosCorret.length}</span>
                        <span style={{ fontSize: 11, color: pctAtivacao < 25 ? "var(--red)" : "var(--ink-3)", marginLeft: 6, fontWeight: 700 }}>
                          ({pctAtivacao}%)
                        </span>
                      </div>
                      <div className="dir-micro-bar">
                        <i
                          className={pctAtivacao >= 40 ? "ok" : pctAtivacao >= 25 ? "warn" : "crit"}
                          style={{ width: `${pctAtivacao}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <Z n={gastoSuper} fmt={brl} />
                  </td>
                  <td>
                    {custoPorVenda ? brl(custoPorVenda) : <span className="z">—</span>}
                  </td>
                  <td>
                    {travadasSuper > 0 ? (
                      <span className="r" style={{ fontWeight: 800 }}>{travadasSuper}</span>
                    ) : <span className="g">0</span>}
                  </td>
                  <td>
                    <span className={`dir-health-badge ${saudeCls}`}>
                      {saudeTxt}
                    </span>
                  </td>
                  <td>
                    <button
                      className="dir-btn-action"
                      onClick={() => setModalCobranca({
                        destinatarioNome: s.nome,
                        destinatarioId: s.id,
                        telefone: s.phone ?? null,
                        motivo: `Alinhamento de meta: ${f?.realizado ?? t.vendas}/${metaQtd} vendas · ${travadasSuper} pastas travadas`,
                        mensagem: `Fala ${s.nome}, revisando os números de fechamento da sua superintendência: temos ${f?.realizado ?? t.vendas} vendas realizadas de uma meta de ${metaQtd || "—"} (${pctMeta ?? 0}% atingido). Temos ${travadasSuper} pastas paradas há 7d+ no Junix. Vamos focar em destravar essas pastas para puxar o VGV esta semana?`
                      })}
                    >
                      📱 Cobrar Super
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Versão Mobile / Tablet: Cards Executivos Táteis */}
        <div className="dir-scorecard-mobile">
          {supers.map((s) => {
            const ls = cons.filter((l) => s.gerentes.some((g) => g.id === l.id) || l.id === s.id || l.id === `outros:${s.id}`);
            const t = somar(s.nome, ls);
            const f = (metas?.filhos ?? []).find((x) => x.id === s.id);
            const metaQtd = f?.meta ?? 0;
            const pctMeta = metaQtd ? Math.round((f?.realizado ?? t.vendas) / metaQtd * 100) : null;

            const todosCorret = s.gerentes.flatMap((g) => g.corretores_lista);
            const ativosComVenda = todosCorret.filter((c) => (c.vendas_mes ?? 0) > 0).length;
            const pctAtivacao = todosCorret.length ? Math.round((ativosComVenda / todosCorret.length) * 100) : 0;

            const pastasDoSuper = pastas.filter((p) => donoJunix(supers, p.superintendente, p.gerente).superId === s.id);
            const travadasSuper = pastasDoSuper.filter((p) => (p.dias ?? 0) >= 7).length;

            const gastoSuper = t.gasto ?? 0;
            const custoPorVenda = t.vendas && gastoSuper ? Math.round(gastoSuper / t.vendas) : null;

            let saudeCls = "dir-health-green";
            let saudeTxt = "🟢 Alta";
            if ((pctMeta != null && pctMeta < 50 && hoje.getDate() > 15) || travadasSuper >= 6 || (pctAtivacao < 20 && todosCorret.length > 5)) {
              saudeCls = "dir-health-red";
              saudeTxt = "🔴 Crítica";
            } else if ((pctMeta != null && pctMeta < 70 && hoje.getDate() > 10) || travadasSuper >= 3 || pctAtivacao < 35) {
              saudeCls = "dir-health-yellow";
              saudeTxt = "🟡 Atenção";
            }

            return (
              <div key={`mob-${s.id}`} className="dir-super-card">
                <div className="dir-super-card-header">
                  <div>
                    <div className="dir-super-card-title">{s.nome}</div>
                    <div className="dir-super-card-sub">
                      {s.gerentes.length} gerentes · {todosCorret.length} corretores
                    </div>
                  </div>
                  <span className={`dir-health-badge ${saudeCls}`}>
                    {saudeTxt}
                  </span>
                </div>

                <div className="dir-super-card-grid">
                  <div className="dir-super-kpi">
                    <small>Meta / Realizado</small>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span className="val">{f?.realizado ?? t.vendas}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>de {metaQtd || "—"}</span>
                      {pctMeta != null && (
                        <span className={`dir-chip ${pctMeta >= 100 ? "c-grn" : pctMeta >= 65 ? "c-blue" : "c-red"}`} style={{ marginLeft: "auto" }}>
                          {pctMeta}%
                        </span>
                      )}
                    </div>
                    {pctMeta != null && (
                      <div className="dir-micro-bar" style={{ width: "100%", marginTop: 4 }}>
                        <i className={pctMeta >= 100 ? "ok" : pctMeta >= 65 ? "" : "crit"} style={{ width: `${Math.min(100, pctMeta)}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="dir-super-kpi">
                    <small>VGV 30d</small>
                    <span className="val">{curto(t.vgv)}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Junix</span>
                  </div>

                  <div className="dir-super-kpi">
                    <small>Ativação da Tropa</small>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span className="val">{ativosComVenda}/{todosCorret.length}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pctAtivacao < 25 ? "var(--red)" : "var(--ink-3)" }}>
                        ({pctAtivacao}%)
                      </span>
                    </div>
                    <div className="dir-micro-bar" style={{ width: "100%", marginTop: 4 }}>
                      <i className={pctAtivacao >= 40 ? "ok" : pctAtivacao >= 25 ? "warn" : "crit"} style={{ width: `${pctAtivacao}%` }} />
                    </div>
                  </div>

                  <div className="dir-super-kpi">
                    <small>Pastas Travadas (7d+)</small>
                    <span className="val" style={{ color: travadasSuper > 0 ? "var(--red)" : "var(--grn)" }}>
                      {travadasSuper} {travadasSuper === 1 ? "pasta" : "pastas"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {travadasSuper > 0 ? "risco de distrato" : "esteira fluida"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--ink-3)", background: "var(--sunk)", padding: "8px 10px", borderRadius: 8 }}>
                  <span>Mídia: <b><Z n={gastoSuper} fmt={brl} /></b></span>
                  <span>Custo/Venda: <b>{custoPorVenda ? brl(custoPorVenda) : "—"}</b></span>
                </div>

                <div className="dir-super-card-footer">
                  <button
                    className="dir-btn-action full"
                    onClick={() => setModalCobranca({
                      destinatarioNome: s.nome,
                      destinatarioId: s.id,
                      telefone: s.phone ?? null,
                      motivo: `Alinhamento de meta: ${f?.realizado ?? t.vendas}/${metaQtd} vendas · ${travadasSuper} pastas travadas`,
                      mensagem: `Fala ${s.nome}, revisando os números de fechamento da sua superintendência: temos ${f?.realizado ?? t.vendas} vendas realizadas de uma meta de ${metaQtd || "—"} (${pctMeta ?? 0}% atingido). Temos ${travadasSuper} pastas paradas há 7d+ no Junix. Vamos focar em destravar essas pastas para puxar o VGV esta semana?`
                    })}
                  >
                    📱 Cobrar {s.nome} no WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dir-grid3">
        <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Funil da empresa · 30 dias</div>
          {!funil.length ? <span className="dir-nota">carregando…</span> : funil.map((f) => (
            <div key={f.nome}>
              <div style={{ display: "flex", fontSize: 13.5 }}><span style={{ fontWeight: 600 }}>{f.nome}</span><span className="mono" style={{ marginLeft: "auto", fontWeight: 700 }}>{nf(f.n)}</span></div>
              <div style={{ height: 8, background: "var(--sunk)", borderRadius: 4, marginTop: 4 }}>
                <div style={{ height: 8, borderRadius: 4, width: `${Math.max(1, (f.n / maxF) * 100)}%`, background: f.ruim ? "#C8473D" : "#2F6FB3" }} /></div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{f.obs}</div>
            </div>
          ))}
        </div>

        {/* Pipeline por Etapa Junix */}
        <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Pipeline de Pastas (Junix)</div>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{rp.vivas} pastas vivas de {rp.total} no Junix · previsão {(Math.round(rp.previsao * 10) / 10).toLocaleString("pt-BR")} vendas no mês</span>
          <div className="dir-list">
            {[
              ["Reta final (emissão, proposta, aprovada)", rp.reta.n, "var(--teal)", "50–85% de chance"],
              ["Análise / Documentos", rp.meio.n, "var(--ink)", "20–30% de chance"],
              ["Cadastro / Unidade", rp.comeco.n, "var(--ink-3)", "6–12% de chance"],
              ["Fora da conta", rp.reprovadas + rp.mortas + rp.duplicadas, "var(--red)", "reprovadas, paradas 60+ dias, duplicadas"],
            ].map(([et, count, cor, prob]) => (
              <div key={et as string}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  {et as string} <small style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>({prob})</small>
                </span>
                <span className="mono" style={{ fontSize: 17, fontWeight: 700, color: cor as string }}>
                  {count as number}
                </span>
              </div>
            ))}
          </div>
          <button className="dir-btn" style={{ marginTop: 8 }} onClick={() => irPara("pastas")}>
            Ver todas as pastas ›
          </button>
        </div>

        <CobrancasResumo cobrancas={cobrancas} supers={supers} cons={cons} />
      </div>

      {/* MODAL DE COBRANÇA EXECUTIVA DIRETA */}
      {modalCobranca && (
        <div className="dir-modal-backdrop" onClick={() => setModalCobranca(null)}>
          <div className="dir-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="dir-lbl">Ação Direta da Diretoria</span>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0", color: "var(--ink)" }}>
                  Cobrar {modalCobranca.destinatarioNome}
                </h3>
              </div>
              <button
                onClick={() => setModalCobranca(null)}
                style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer", color: "var(--ink-3)" }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, color: "var(--ink-2)", background: "var(--sunk)", padding: "10px 12px", borderRadius: 8 }}>
              <b>Motivo detectado pelo sistema:</b><br />
              {modalCobranca.motivo}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>
                Mensagem WhatsApp (editável antes de enviar)
              </label>
              <textarea
                rows={5}
                value={modalCobranca.mensagem}
                onChange={(e) => setModalCobranca({ ...modalCobranca, mensagem: e.target.value })}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  resize: "vertical"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button className="dir-btn" onClick={() => setModalCobranca(null)}>Cancelar</button>
              <button
                className="dir-btn-wpp"
                onClick={() => dispararCobranca(
                  modalCobranca.destinatarioId,
                  modalCobranca.destinatarioNome,
                  modalCobranca.motivo,
                  modalCobranca.mensagem,
                  modalCobranca.telefone,
                  modalCobranca.decId
                )}
              >
                <span>📱 Abrir no WhatsApp & Registrar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── EQUIPES ───────────────────────── */
type ArvoreProps = { supers: SuperDiretoria[]; linhasDoSuper: (s: SuperDiretoria) => LinhaConsolidado[]; aberto: Record<string, boolean>;
  tog: (k: string) => void; abrirPainel: (id: string) => void; carregandoCons: boolean };

function Equipes({ supers, linhasDoSuper, aberto, tog, abrirPainel, carregandoCons }: ArvoreProps) {
  const cel = (g: { corretores: number; plantaoHoje: number; semLogin: number; logados: number; online: number }, l: LinhaConsolidado | null) => (<>
    <td>{g.corretores}</td>
    <td><Z n={g.plantaoHoje} /></td>
    <td><Z n={g.semLogin} cls="r" /></td>
    <td><Z n={g.logados} /></td>
    <td><Z n={g.online} cls="g" /></td>
    <td>{l ? <Z n={l.plantaoDias} /> : "…"}</td>
    <td>{l ? <Z n={l.visitas} /> : "…"}</td>
    <td>{l ? <Z n={l.vendas} cls="g" /> : "…"}</td>
    <td>{l ? <Z n={l.vgv} fmt={curto} /> : "…"}</td>
  </>);
  const numsGer = (s: SuperDiretoria, g: SuperDiretoria["gerentes"][number]) => ({
    corretores: g.corretores, plantaoHoje: g.plantao_hoje, semLogin: s.plantaoSemLogin[g.id]?.length ?? 0,
    logados: g.corretores_lista.filter((c) => s.logadosHoje[c.id]).length, online: g.online });
  const somaN = (xs: ReturnType<typeof numsGer>[]) => xs.reduce((a, x) => ({ corretores: a.corretores + x.corretores, plantaoHoje: a.plantaoHoje + x.plantaoHoje,
    semLogin: a.semLogin + x.semLogin, logados: a.logados + x.logados, online: a.online + x.online }), { corretores: 0, plantaoHoje: 0, semLogin: 0, logados: 0, online: 0 });
  const todos = supers.flatMap((s) => s.gerentes.map((g) => numsGer(s, g)));

  return (
    <div className="dir-card" style={{ padding: "18px 0 6px" }}>
      <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Superintendências, gerentes e corretores</b>
        <span>plantão e login são de hoje · visitas, vendas e VGV no período{carregandoCons ? " (carregando…)" : ""}</span></div>
      <div className="dir-tree">
        <table>
          <thead><tr><th>Equipe</th><th>Corretores</th><th>Plantão hoje</th><th>Plantão sem login</th><th>Entraram hoje</th><th>Online agora</th><th>Dias de plantão</th><th>Visitas</th><th>Vendas</th><th>VGV</th></tr></thead>
          <tbody>
            {supers.map((s) => {
              const kS = `s:${s.id}`; const ls = linhasDoSuper(s);
              return [
                <tr key={kS} className="n0" onClick={() => tog(kS)}>
                  <td><Seta on={!!aberto[kS]} />{s.nome} <span style={{ fontWeight: 500, color: "var(--ink-3)", fontSize: 12 }}>· {s.c2s ? `${s.c2s.gerentes.length} gerentes no C2S` : `${s.gerentes.length} gerentes`}</span></td>
                  {s.c2s ? cel({ corretores: 0, plantaoHoje: s.c2s.hoje, semLogin: 0, logados: 0, online: 0 },
                    carregandoCons ? null : { ...somar(s.nome, ls), plantaoDias: s.c2s.dias })
                    : cel(somaN(s.gerentes.map((g) => numsGer(s, g))), carregandoCons ? null : somar(s.nome, ls))}
                </tr>,
                ...(aberto[kS] && s.c2s ? [
                  <tr key={`c2sx:${s.id}`} className="n3"><td colSpan={10} style={{ textAlign: "left" }}>
                    Plantão lido do C2S: os gerentes desta superintendência ainda não têm conta no Comandra (no C2S ela ainda consta na diretoria anterior).</td></tr>,
                  ...s.c2s.gerentes.map((g) => (
                    <tr key={`c2s:${s.id}:${g.nome}`} className="n1">
                      <td>{g.nome} <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>· {g.corretores} no plantão · sem conta no Comandra</span></td>
                      <td /><td><Z n={g.hoje} /></td><td /><td /><td /><td><Z n={g.dias} /></td><td /><td /><td />
                    </tr>)),
                ] : []),
                ...(aberto[kS] ? s.gerentes.flatMap((g) => {
                  const kG = `g:${g.id}`; const sem = s.plantaoSemLogin[g.id] ?? [];
                  return [
                    <tr key={kG} className="n1" onClick={() => tog(kG)}>
                      <td><Seta on={!!aberto[kG]} />{g.nome}<button className="dir-abrir" onClick={(e) => { e.stopPropagation(); abrirPainel(g.id); }}>abrir painel ›</button></td>
                      {cel(numsGer(s, g), carregandoCons ? null : ls.find((l) => l.id === g.id) ?? linhaVazia(g.id, g.nome))}
                    </tr>,
                    ...(aberto[kG] ? [
                      ...g.corretores_lista.map((c) => (
                        <tr key={`c:${c.id}`} className="n2">
                          <td><span className={`dir-dot${c.online ? " on" : s.logadosHoje[c.id] ? " mid" : ""}`} />{c.nome}
                            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}> · {c.online ? "online" : s.logadosHoje[c.id] ? "entrou hoje" : c.ultimo_acesso ? `último acesso ${new Date(c.ultimo_acesso).toLocaleDateString("pt-BR")}` : "nunca entrou"}</span></td>
                          <td />
                          <td>{c.plantao_hoje ? <span className="g">✓</span> : <span className="z">—</span>}</td>
                          <td />
                          <td>{s.logadosHoje[c.id] ? <span className="g">✓</span> : <span className="z">—</span>}</td>
                          <td>{c.online ? <span className="g">●</span> : <span className="z">—</span>}</td>
                          <td /><td />
                          <td><Z n={c.vendas_mes} cls="g" /></td>
                          <td />
                        </tr>
                      )),
                      ...(sem.length ? [<tr key={`sl:${g.id}`} className="n3"><td colSpan={10} style={{ textAlign: "left" }}>
                        <span className="r">No plantão hoje sem login:</span> {sem.join(" · ")}</td></tr>] : []),
                      ...(!g.corretores_lista.length && !sem.length ? [<tr key={`v:${g.id}`} className="n3"><td colSpan={10} style={{ textAlign: "left" }}>Nenhum corretor cadastrado.</td></tr>] : []),
                    ] : []),
                  ];
                }) : []),
              ];
            })}
            <tr className="tot"><td>Empresa</td>{(() => {
              const c2sDias = supers.reduce((a, s) => a + (s.c2s?.dias ?? 0), 0), c2sHoje = supers.reduce((a, s) => a + (s.c2s?.hoje ?? 0), 0);
              const n = somaN(todos); const t = carregandoCons ? null : somar("Empresa", supers.flatMap(linhasDoSuper));
              return cel({ ...n, plantaoHoje: n.plantaoHoje + c2sHoje }, t ? { ...t, plantaoDias: t.plantaoDias + c2sDias } : null);
            })()}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── LEADS ───────────────────────── */
function Leads({ supers, linhasDoSuper, total, aberto, tog, abrirPainel, carregandoCons, dias }: ArvoreProps & { total: LinhaConsolidado | null; dias: number }) {
  // anúncio que chegou mas ficou sem gerente (barrado pela região, ou página sem corretor na fila) — a árvore não enxerga
  const { data: semDono } = useQuery({
    queryKey: ["leads-anuncio-sem-dono", dias], staleTime: 2 * 60_000,
    queryFn: async () => {
      const de = new Date(Date.now() - 3 * 3600e3 - (dias - 1) * 864e5).toISOString().slice(0, 10);
      const { data } = await supabase.rpc("leads_anuncio_sem_dono" as any, { p_de: `${de}T03:00:00Z` });
      return (data ?? {}) as { fora_regiao?: number; sem_dono?: number };
    },
  });
  if (carregandoCons || !total) return <div className="dir-card dir-vazio">Buscando gasto no Facebook e leads de cada equipe…</div>;
  const cplEmpresa = total.leadsFb ? (total.gasto ?? 0) / total.leadsFb : 0;
  const cel = (l: LinhaConsolidado, emConversa?: number) => {
    const cpl = l.leadsFb ? (l.gasto ?? 0) / l.leadsFb : 0;
    return (<>
      <td><Z n={l.gasto} fmt={brl} /></td>
      <td><Z n={l.leadsFb} /></td>
      <td>{cpl ? <span className={cplEmpresa && cpl > cplEmpresa * 1.3 ? "r" : ""}>{brl(cpl)}</span> : <span className="z">—</span>}</td>
      <td><Z n={l.leads.anuncio} /></td>
      <td><Z n={l.leads.disparo} /></td>
      <td><Z n={l.leads.pescados} /></td>
      <td><Z n={l.leads.outros} /></td>
      <td><b><Z n={totLeads(l)} /></b></td>
      <td><Z n={l.nuncaFalaram} cls="r" /></td>
      <td>{emConversa == null ? <span className="z">·</span> : <Z n={emConversa} cls="g" />}</td>
      <td><Z n={l.visitas} /></td>
    </>);
  };
  // ranking de investimento por gerente
  const gers = supers.flatMap((s) => linhasDoSuper(s).filter((l) => (l.gasto ?? 0) > 0).map((l) => ({ s, l })))
    .sort((a, b) => (b.l.gasto ?? 0) - (a.l.gasto ?? 0));
  const maxG = Math.max(1, ...gers.map((x) => x.l.gasto ?? 0));

  // Conciliação matemática de leads de anúncio
  const leadsFbTotal = total.leadsFb ?? 0;
  const leadsAnuncioComandra = total.leads.anuncio;
  const leadsSemContaMonitorada = Math.max(0, leadsAnuncioComandra - leadsFbTotal);
  const foraRegiao = semDono?.fora_regiao ?? 0, orfaos = semDono?.sem_dono ?? 0;
  const chegaram = leadsAnuncioComandra + foraRegiao + orfaos;

  return (
    <>
      <div className="dir-grid3">
        <div className="dir-card" style={{ padding: 18 }}>
          <div className="dir-h" style={{ marginBottom: 8 }}>
            <b>Investimento por Conta de Anúncio</b>
            <span>Lido via API do Facebook ({gers.length} contas conectadas) · Média CPL: {cplEmpresa ? brl(cplEmpresa) : "—"}</span>
          </div>
          <div className="dir-barras">
            {!gers.length ? <span className="dir-nota">Nenhuma conta de anúncio com gasto no período.</span> : gers.map(({ s, l }) => {
              const cpl = l.leadsFb ? (l.gasto ?? 0) / l.leadsFb : 0;
              return (
                <div key={l.id}>
                  <span title={s.nome}><b>{l.nome}</b></span>
                  <span className="tr"><i className={cplEmpresa && cpl > cplEmpresa * 1.3 ? "ruim" : ""} style={{ width: `${((l.gasto ?? 0) / maxG) * 100}%` }} /></span>
                  <span className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>{brl(l.gasto ?? 0)}<br /><span style={{ color: "var(--ink-3)" }}>{l.leadsFb ?? 0} leads · {cpl ? brl(cpl) : "—"}</span></span>
                </div>
              );
            })}
            {leadsSemContaMonitorada > 0 && (
              <div style={{ borderTop: "1px dashed var(--line)", marginTop: 6, paddingTop: 6, opacity: 0.85 }}>
                <span title="Outras equipes">
                  <b style={{ color: "var(--ink-2)", fontSize: 12 }}>Outras equipes (sem API)</b>
                </span>
                <span className="tr"><i style={{ width: "10%", background: "#94A3B8" }} /></span>
                <span className="mono" style={{ textAlign: "right", fontSize: 12 }}>
                  <span style={{ color: "var(--ink-3)" }}>gasto não rastreado</span><br />
                  <b>+{leadsSemContaMonitorada} leads</b>
                </span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--line-2)", display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
            <span style={{ color: "var(--ink-3)" }}>Total em Anúncios:</span>
            <b>{leadsAnuncioComandra} com as equipes · Facebook registrou {leadsFbTotal}</b>
          </div>
        </div>

        <div className="dir-card" style={{ padding: 18 }}>
          <div className="dir-h" style={{ marginBottom: 8 }}>
            <b>Canais de Entrada no Comandra</b>
            <span>Total real de leads que entraram na base no período ({nf(totLeads(total))} leads)</span>
          </div>
          <div className="dir-barras">
            {([
              ["Anúncios (Facebook)", total.leads.anuncio],
              ["Pesca (Carteira Fria)", total.leads.pescados],
              ["Disparos WhatsApp", total.leads.disparo],
              ["Outros", total.leads.outros]
            ] as [string, number][]).map(([t, n]) => (
              <div key={t}>
                <span><b>{t}</b></span>
                <span className="tr"><i style={{ width: `${(n / Math.max(1, totLeads(total))) * 100}%` }} /></span>
                <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{nf(n)}</span>
              </div>
            ))}
          </div>

          {/* Conciliação explicativa transparente */}
          <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--sunk)", borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
            <div>Chegaram <b>{chegaram} leads de anúncio</b>: <b>{leadsAnuncioComandra}</b> com as equipes
              {foraRegiao ? <> · <b>{foraRegiao}</b> barrados por estar fora da região</> : null}
              {orfaos ? <> · <b style={{ color: "var(--red)" }}>{orfaos} sem dono</b></> : null}.</div>
            {leadsFbTotal > chegaram ? (
              <div style={{ color: "var(--red)", marginTop: 4 }}>
                ⚠️ <b>Atenção:</b> o Facebook registrou <b>{leadsFbTotal}</b> leads nas contas e <b>{leadsFbTotal - chegaram}</b> não chegaram ao Comandra. Confira o cenário do Make dessa conta.
              </div>
            ) : (
              <div style={{ color: "var(--grn)", fontWeight: 600, marginTop: 4 }}>
                ✓ Todos os {leadsFbTotal} leads registrados pelo Facebook chegaram ao Comandra{chegaram > leadsFbTotal ? ` (mais ${chegaram - leadsFbTotal} de contas sem API ou contados em outro dia pelo Facebook)` : ""}.
              </div>
            )}
            {orfaos ? <div style={{ color: "var(--red)", marginTop: 4 }}>Lead sem dono = a página do anúncio não tem corretor na fila. Ninguém foi avisado.</div> : null}
          </div>
        </div>
      </div>

      <div className="dir-card" style={{ padding: "18px 0 6px" }}>
        <div className="dir-h" style={{ padding: "0 18px 10px" }}>
          <b>Leads por equipe</b>
          <span>abra a superintendência e o gerente · traço (—) no investimento indica gerente sem conta do Facebook conectada</span>
        </div>
        <div className="dir-tree">
          <table>
            <thead><tr><th>Equipe</th><th>Investimento</th><th>Leads Facebook</th><th>Custo/lead</th><th>Anúncio</th><th>Disparo</th><th>Pescados</th><th>Outros</th><th>Total</th><th>Sem toque</th><th>Em conversa 24h</th><th>Visitas</th></tr></thead>
            <tbody>
              {supers.map((s) => {
                const kS = `s:${s.id}`; const ls = linhasDoSuper(s);
                const emConvS = s.gerentes.reduce((a, g) => a + g.em_conversa, 0);
                return [
                  <tr key={kS} className="n0" onClick={() => tog(kS)}><td><Seta on={!!aberto[kS]} />{s.nome}</td>{cel(somar(s.nome, ls), emConvS)}</tr>,
                  ...(aberto[kS] ? ls.flatMap((l) => {
                    const g = s.gerentes.find((x) => x.id === l.id); const kG = `lg:${l.id}`;
                    return [
                      <tr key={kG} className={g ? "n1" : "n2"} onClick={() => g && tog(kG)}>
                        <td>{g ? <Seta on={!!aberto[kG]} /> : null}{l.nome}{g ? <button className="dir-abrir" onClick={(e) => { e.stopPropagation(); abrirPainel(g.id); }}>abrir painel ›</button> : null}</td>
                        {cel(l, g?.em_conversa)}
                      </tr>,
                      ...(g && aberto[kG] ? g.corretores_lista.map((c) => (
                        <tr key={`lc:${c.id}`} className="n2">
                          <td>{c.nome} <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>· carteira {c.carteira}</span></td>
                          <td /><td /><td /><td /><td /><td /><td />
                          <td><Z n={c.leads_periodo} /></td><td /><td><Z n={c.em_conversa} cls="g" /></td><td />
                        </tr>
                      )) : []),
                    ];
                  }) : []),
                ];
              })}
              <tr className="tot"><td>Empresa</td>{cel(total, supers.reduce((a, s) => a + s.gerentes.reduce((b, g) => b + g.em_conversa, 0), 0))}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── PASTAS ───────────────────────── */
const ETAPAS: [string, (e: string) => boolean][] = [
  ["Cadastro", (e) => /cadastro/i.test(e)],
  ["Unidade", (e) => /unidade/i.test(e)],
  ["Análise", (e) => /laudo|an[aá]lise/i.test(e)],
  ["Documentos", (e) => /documento/i.test(e)],
  ["Proposta", (e) => /proposta|simular|emiss/i.test(e)],
  ["Venda", (e) => /venda/i.test(e)],
];
const etapaDe = (e: string | null) => ETAPAS.find(([, f]) => f(e ?? ""))?.[0] ?? "Outras";

function Pastas({ supers, pastas, aberto, tog }: { supers: SuperDiretoria[]; pastas: PastaJunix[]; aberto: Record<string, boolean>; tog: (k: string) => void }) {
  // super → gerente (nome do Junix) → corretor → pastas
  const arv = new Map<string, Map<string, Map<string, PastaJunix[]>>>();
  for (const p of pastas) {
    const { superId, gerenteId } = donoJunix(supers, p.superintendente, p.gerente);
    const gNome = supers.flatMap((s) => s.gerentes).find((g) => g.id === gerenteId)?.nome ?? p.gerente ?? "Sem gerente";
    const cNome = (p.corretor ?? "Sem corretor").replace(/\s+BN\s*$/i, "");
    if (!arv.has(superId)) arv.set(superId, new Map());
    const ms = arv.get(superId)!; if (!ms.has(gNome)) ms.set(gNome, new Map());
    const mg = ms.get(gNome)!; if (!mg.has(cNome)) mg.set(cNome, []);
    mg.get(cNome)!.push(p);
  }
  const cel = (ps: PastaJunix[]) => {
    const trav = ps.filter((p) => (p.dias ?? 0) >= 7).length;
    return (<>
      <td><b>{ps.length}</b></td>
      <td><Z n={trav} cls="r" /></td>
      {[...ETAPAS.map(([t]) => t), "Outras"].map((t) => <td key={t}><Z n={ps.filter((p) => etapaDe(p.etapa) === t).length} /></td>)}
      <td>{ps.length ? Math.round(ps.reduce((a, p) => a + (p.dias ?? 0), 0) / ps.length) + "d" : "—"}</td>
    </>);
  };
  const grupos = [...supers.map((s) => ({ id: s.id, nome: s.nome })), ...(arv.has("fora") ? [{ id: "fora", nome: "Sem superintendência no Comandra" }] : [])];
  const flat = (m?: Map<string, Map<string, PastaJunix[]>>) => [...(m?.values() ?? [])].flatMap((x) => [...x.values()].flat());

  if (!pastas.length) return <div className="dir-card dir-vazio">Nenhuma pasta no Junix agora.</div>;
  return (
    <div className="dir-card" style={{ padding: "18px 0 6px" }}>
      <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Pastas abertas no Junix</b><span>{pastas.length} pastas agora · parada = 7 dias ou mais na mesma etapa · abra até o cliente</span></div>
      <div className="dir-tree">
        <table>
          <thead><tr><th>Equipe</th><th>Pastas</th><th>Paradas 7d+</th>{[...ETAPAS.map(([t]) => t), "Outras"].map((t) => <th key={t}>{t}</th>)}<th>Média</th></tr></thead>
          <tbody>
            {grupos.map((s) => {
              const ms = arv.get(s.id); const kS = `ps:${s.id}`;
              return [
                <tr key={kS} className="n0" onClick={() => tog(kS)}><td><Seta on={!!aberto[kS]} />{s.nome}</td>{cel(flat(ms))}</tr>,
                ...(aberto[kS] && ms ? [...ms.entries()].sort((a, b) => flat(new Map([b])).length - flat(new Map([a])).length).flatMap(([gNome, mg]) => {
                  const kG = `pg:${s.id}:${gNome}`;
                  return [
                    <tr key={kG} className="n1" onClick={() => tog(kG)}><td><Seta on={!!aberto[kG]} />{gNome}</td>{cel([...mg.values()].flat())}</tr>,
                    ...(aberto[kG] ? [...mg.entries()].flatMap(([cNome, ps]) => {
                      const kC = `pc:${kG}:${cNome}`;
                      return [
                        <tr key={kC} className="n2" style={{ cursor: "pointer" }} onClick={() => tog(kC)}><td><Seta on={!!aberto[kC]} />{cNome}</td>{cel(ps)}</tr>,
                        ...(aberto[kC] ? ps.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).map((p) => (
                          <tr key={p.proposta_id} className="n3">
                            <td colSpan={2}>{p.cliente ?? "—"} · {p.empreendimento ?? "—"}</td>
                            <td colSpan={ETAPAS.length + 1} style={{ textAlign: "left" }}>{p.etapa ?? "—"}</td>
                            <td colSpan={2} className={(p.dias ?? 0) >= 7 ? "r" : ""}>{p.dias ?? 0} dias</td>
                          </tr>
                        )) : []),
                      ];
                    }) : []),
                  ];
                }) : []),
              ];
            })}
            <tr className="tot"><td>Empresa</td>{cel(pastas)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
