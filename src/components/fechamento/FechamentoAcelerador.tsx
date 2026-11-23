import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";
import { toast } from "sonner";
import "@/styles/fechamento.css";

/* Aceleração de Fechamento — "Onde as vendas estão paradas".
   Fonte: export diário "Pesquisa" (Junix/Cury), ingerido por fechamento_ingerir
   (evento datado pela DataContato); leitura por fechamento_painel. Cobrar copia
   o texto por enquanto (Régua = fase seguinte). */

type Periodo = "sem" | "mes" | "d7";
const sb = supabase as any;

function janela(p: Periodo): [string, string] {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "mes") return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
  if (p === "d7") { const d = new Date(hoje); d.setDate(d.getDate() - 6); return [iso(d), iso(hoje)]; }
  const dow = (hoje.getDay() + 6) % 7; const seg = new Date(hoje); seg.setDate(seg.getDate() - dow);
  return [iso(seg), iso(hoje)];
}
const CMP: Record<Periodo, string> = { sem: "a semana passada", mes: "o mês passado", d7: "os 7 dias anteriores" };
const EM: Record<number, string> = { 1: "📁", 2: "📎", 3: "🏦", 4: "✅", 5: "✍️" };
const VAL: Record<number, string> = { 1: "pasta em montagem", 2: "falta doc/renda", 3: "na Caixa", 4: "contrato a emitir", 5: "quase venda" };
const ACAO: Record<string, string> = { corretor: "cobrar o corretor a completar a pasta", cliente: "cobrar o doc/renda do cliente", banco: "cobrar o retorno da Caixa", secretaria: "cobrar a secretaria a emitir", "-": "acompanhar" };
const ini = (s: string) => (s || "").slice(0, 2).toUpperCase();
const faixa = (d: number) => (d <= 7 ? "f" : d <= 30 ? "m" : "v");

async function lerCsv(f: File): Promise<string[][]> {
  const buf = await f.arrayBuffer();
  let txt: string;
  try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { txt = new TextDecoder("windows-1252").decode(buf); }
  txt = txt.replace(/^﻿/, "").replace(/\r/g, "");
  const h = txt.split("\n")[0];
  const sep = (h.match(/;/g)?.length ?? 0) >= (h.match(/,/g)?.length ?? 0) ? ";" : ",";
  return txt.split("\n").filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}
function dt(s: string): string | null {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}` : null;
}
function dataDoArquivo(nome: string): string {
  const m = nome.match(/(\d{2})(\d{2})(\d{2})/);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
}

export default function FechamentoAcelerador({ podeSubir = true }: { podeSubir?: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>("sem");
  const [dir, setDir] = useState<string | null>(null);
  const [ger, setGer] = useState<string | null>(null);
  const [etapaSel, setEtapaSel] = useState<number>(4);
  const [d, setD] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [subindo, setSubindo] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false); // banco sem o motor de Fechamento (ex.: planoego) → some
  const fileRef = useRef<HTMLInputElement>(null);
  const [de, ate] = useMemo(() => janela(periodo), [periodo]);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await sb.rpc("fechamento_painel", { p_de: de, p_ate: ate, p_diretor: dir, p_gerente: ger, p_etapa: etapaSel });
    setCarregando(false);
    if (error) {
      // Motor de Fechamento não existe neste banco (planoego): some sem erro.
      if ((error as any).code === "PGRST202" || /Could not find the function|schema cache/i.test(error.message)) { setIndisponivel(true); return; }
      toast.error("Não consegui ler o painel: " + error.message); return;
    }
    setD(data);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [de, ate, dir, ger, etapaSel]);

  async function subir(f?: File) {
    if (!f) return; setSubindo(true);
    try {
      const linhas = await lerCsv(f);
      const head = (linhas[0] ?? []).map((h) => h.toLowerCase().replace(/\s/g, ""));
      if (!(head[0]?.includes("datacadastro") && head[1]?.includes("codproposta") && head.some((h) => h.includes("statusproposta")))) {
        toast.error("Esse arquivo não é o export Pesquisa (colunas em outra ordem). Baixe o Pesquisa do dia."); setSubindo(false); if (fileRef.current) fileRef.current.value = ""; return;
      }
      const rows = linhas.slice(1).filter((c) => c.length >= 13 && c[1]?.trim()).map((c) => ({
        cod: c[1], cliente: c[2], emp: c[3], bloco: c[4], uni: c[5], corr: c[6], ger: c[7], dir: c[8],
        status: c[12], cadastro: dt(c[0]), contato: dt(c[10]),
      }));
      if (!rows.length) { toast.error("Arquivo sem linhas válidas."); setSubindo(false); return; }
      const pData = dataDoArquivo(f.name);
      const { data, error } = await sb.rpc("fechamento_ingerir", { p_data: pData, p_rows: rows });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      toast.success(`Pesquisa de ${pData.split("-").reverse().join("/")}: ${r?.linhas ?? rows.length} linhas · ${r?.mudancas ?? 0} mudanças`);
      await carregar();
    } catch (e: any) { toast.error("Falha ao carregar: " + (e?.message ?? e)); }
    finally { setSubindo(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const fluxo = d?.fluxo ?? {};
  const porEtapa: any[] = d?.por_etapa ?? [];
  const porEquipe: any[] = d?.por_equipe ?? [];
  const salvar: any[] = d?.salvar ?? [];
  const faxinaD = d?.faxina ?? {};
  const nivel = d?.nivel ?? "diretor";
  const temFilho = nivel !== "corretor";

  const gargaloOrdem = useMemo(() => {
    const bloq = porEtapa.filter((e) => [1, 2, 3].includes(e.ordem));
    if (!bloq.length) return null;
    return bloq.reduce((a, b) => (b.v > a.v ? b : a)).ordem;
  }, [porEtapa]);

  const copiloto = useMemo(() => {
    const et = (o: number) => porEtapa.find((e) => e.ordem === o);
    const out: any[] = [];
    const ap = et(4);
    if (ap?.n) out.push({ cls: "money", ico: "💰", big: ap.n, t: `<b>${ap.n} aprovadas sem contrato</b> — a Caixa aprovou, falta a secretaria emitir.${ap.v ? ` ${ap.v} passaram de 30 dias.` : ""} É o fechamento mais rápido.`, rot: "Cobrar a secretaria", go: () => setEtapaSel(4) });
    const pe = et(2);
    if (pe?.n) { const pior = [...porEquipe].sort((a, b) => b.pend - a.pend)[0]; out.push({ cls: "pend", ico: "📎", big: pe.n, t: `<b>${pe.n} com pendência</b> travando o banco${pior?.pend ? ` — a maior parte na equipe <b>${pior.nome}</b>` : ""}. Resolver documento/renda destrava.`, rot: "Ver pendências", go: () => setEtapaSel(2) }); }
    const rev = (faxinaD.revisao ?? [])[0];
    if (rev?.n) out.push({ cls: "clean", ico: "🧹", big: rev.n, t: `<b>${rev.n} pastas paradas há +60 dias</b> na equipe ${rev.nome} inflando a meta. Não é cobrança — é decisão de distrato.`, rot: `Pedir revisão a ${rev.nome}`, go: () => pedirRevisao(rev.nome, rev.n) });
    return out.slice(0, 3);
  }, [porEtapa, porEquipe, faxinaD]);

  const delta = (a: number, b: number) => { const x = (a ?? 0) - (b ?? 0); return <b className={x >= 0 ? "gud" : "bad"}>{a ?? 0}</b>; };
  // Cobra o corretor da pasta pelo WhatsApp do próprio líder (cobrar-pessoa resolve
  // nome→chip; cai no chip reserva se o seu estiver off). Mesmo motor do Kanban.
  function cobrar(s: any) {
    const prim = (s.corretor || "").trim().split(" ")[0];
    if (!prim) { toast.error("Essa pasta está sem corretor no arquivo."); return; }
    const msg = `Fechamento: a pasta de ${s.cliente} está em "${s.etapa}" há ${s.dias} dia(s). ${ACAO[s.dono] ?? ""}. Consegue destravar?`;
    enviarPeloMeuChip({ paraNome: prim, rotulo: s.corretor, mensagem: msg, motivo: "pasta em fechamento" });
  }
  // Pede revisão do backlog ao super/gerente responsável.
  function pedirRevisao(nome: string, n: number) {
    const prim = (nome || "").trim().split(" ")[0];
    if (!prim) return;
    enviarPeloMeuChip({ paraNome: prim, rotulo: nome, mensagem: `Revisão de pipeline: ${n} pastas da sua equipe estão paradas há +60 dias e inflando a meta. Dá pra revisar quais distratar ou arquivar no Junix?`, motivo: "revisão de pipeline" });
  }

  const etSel = porEtapa.find((e) => e.ordem === etapaSel);
  const nivelLabel = nivel === "diretor" ? "superintendências · clique p/ ver gerências" : nivel === "gerente" ? "gerências · clique p/ ver corretores" : "corretores desta gerência";

  if (indisponivel) return null;

  return (
    <div className="fech">
      <div className="head">
        <div>
          <h2 className="ftit">Onde as vendas estão paradas</h2>
          <p className="fsub">O pipeline da equipe agora — datas reais do Junix (última movimentação). +60 dias vira faxina.</p>
          <p className="bc">
            <button className={dir || ger ? "" : "cur"} onClick={() => { setDir(null); setGer(null); }}>Diretoria</button>
            {dir ? <> › <button className={ger ? "" : "cur"} onClick={() => setGer(null)}>{dir}</button></> : null}
            {ger ? <> › <button className="cur">{ger}</button></> : null}
          </p>
        </div>
        <div className="hd-r">
          <div className="per">
            {(["sem", "mes", "d7"] as Periodo[]).map((p) => <b key={p} className={periodo === p ? "on" : ""} onClick={() => setPeriodo(p)}>{p === "sem" ? "Semana" : p === "mes" ? "Mês" : "7 dias"}</b>)}
          </div>
          {podeSubir && (
            <div className="up">
              <button onClick={() => fileRef.current?.click()} disabled={subindo}>{subindo ? "Carregando…" : "⬆ Subir Pesquisa (Junix)"}</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => subir(e.target.files?.[0])} />
              <small>{d?.ultima_carga ? `último: ${String(d.ultima_carga).split("-").reverse().join("/")}` : "nada carregado"}</small>
            </div>
          )}
        </div>
      </div>

      {/* movimento — datas reais */}
      <div className="mov">
        <div className="m">{delta(fluxo.avancaram, fluxo.avancaram_ant)}<span>avançaram</span></div><div className="sep" />
        <div className="m"><b className="gud">{fluxo.assinaram ?? 0}</b><span>assinaram</span></div><div className="sep" />
        <div className="m"><b>{fluxo.novas ?? 0}</b><span>novas</span></div><div className="sep" />
        <div className="m"><b className="bad">{fluxo.reprovaram ?? 0}</b><span>reprovaram</span></div>
        <span className="tag">{de.split("-").reverse().slice(0, 2).join("/")}–{ate.split("-").reverse().slice(0, 2).join("/")} · vs {CMP[periodo]}</span>
      </div>

      {/* copiloto */}
      {copiloto.length > 0 && (
        <div className="cop">
          <div className="cop-h"><b>🧠 Copiloto — decida agora</b><span className="lb">por regra, sem achismo</span></div>
          <div className="cop-g">
            {copiloto.map((c, i) => (
              <div className={`dc ${c.cls}`} key={i}>
                <span className="ico">{c.ico}</span><div className="big">{c.big}</div>
                <div className="t" dangerouslySetInnerHTML={{ __html: c.t }} />
                <button onClick={c.go}>{c.rot} →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pipeline */}
      <div className="sec-h"><h3>🩺 Onde entope</h3><span>tamanho = quantas · barra = há quanto tempo paradas · clique p/ detalhe</span></div>
      <div className="pipe">
        {porEtapa.length ? porEtapa.map((e) => {
          const t = e.f + e.m + e.v || 1;
          return (
            <button key={e.ordem} className={`stage ${gargaloOrdem === e.ordem ? "gargalo" : ""} ${etapaSel === e.ordem ? "sel" : ""}`} onClick={() => setEtapaSel(e.ordem)}>
              {gargaloOrdem === e.ordem ? <span className="gbadge">🔴 gargalo</span> : null}
              <div className="top"><span className="em">{EM[e.ordem] ?? "•"}</span><span className={`dono ${e.dono === "-" ? "none" : e.dono}`}>{e.dono === "-" ? "—" : e.dono}</span></div>
              <div className="ct">{e.n}</div><div className="nm">{e.etapa}</div><div className="val">{VAL[e.ordem] ?? ""}</div>
              <div className="age"><i className="f" style={{ width: `${(e.f / t) * 100}%` }} /><i className="m" style={{ width: `${(e.m / t) * 100}%` }} /><i className="v" style={{ width: `${(e.v / t) * 100}%` }} /></div>
              <div className="age-l"><span>{e.f} novas</span><span style={{ color: "var(--red)" }}>{e.v} velhas</span></div>
            </button>
          );
        }) : <div className="vazio" style={{ gridColumn: "1/-1" }}>{carregando ? "Carregando…" : "Sem pasta viva. Suba o Pesquisa do dia."}</div>}
      </div>

      {/* detalhe do estágio: sub-etapas + lista */}
      {etSel && (
        <div className="det">
          <div className="det-h"><span className="em">{EM[etSel.ordem]}</span><b>{etSel.etapa} · {etSel.n} paradas</b>
            <span className="do">Ação: {ACAO[etSel.dono] ?? etSel.etapa}</span></div>
          {(etSel.subs ?? []).length ? (
            <div className="subs">{etSel.subs.map((s: any) => <span className="sb" key={s.status}>{s.status.toLowerCase()} <b>{s.n}</b></span>)}</div>
          ) : null}
          {salvar.length ? salvar.map((r) => (
            <div className="row" key={r.cod}>
              <div className="who"><b>{r.cliente}</b><span>c/ {r.corretor}{r.gerente ? ` · ${r.gerente}` : ""}</span></div>
              <span className={`dias ${faixa(r.dias)}`}>{r.dias} d</span>
              <button className={`cob ${etSel.dono === "secretaria" ? "g" : ""}`} onClick={() => cobrar(r)}>⚡ Cobrar</button>
            </div>
          )) : <div className="vazio">Nada parado neste estágio.</div>}
          {salvar.length >= 60 ? <div className="det-f">mostrando as 60 mais paradas</div> : null}
        </div>
      )}

      {/* por equipe */}
      <div className="sec-h"><h3>🏷️ Por equipe</h3><span>{nivelLabel}</span></div>
      <div className="eq">
        <table>
          <thead><tr><th>Equipe</th><th>Paradas</th><th>Aprov. s/ contrato</th><th>Mais velha</th><th>Pendências</th></tr></thead>
          <tbody>
            {porEquipe.length ? porEquipe.map((e) => (
              <tr key={e.chave} className={temFilho ? "has" : ""} onClick={() => { if (!temFilho) return; nivel === "diretor" ? setDir(e.chave) : setGer(e.chave); }}>
                <td><span className="nm2"><span className="av">{ini(e.nome || e.chave)}</span>{e.nome || e.chave}{(e.pend > 8 || e.velha > 120) ? <span className="gtag">gargalo</span> : null}{temFilho ? <span className="drill">entrar ›</span> : null}</span></td>
                <td>{e.paradas}</td><td className="money">{e.aprov}</td><td className="velha">{e.velha} d</td><td>{e.pend}</td>
              </tr>
            )) : <tr><td colSpan={5} className="vazio">{carregando ? "Carregando…" : "Sem dado no recorte."}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* faxina */}
      {((faxinaD.reprovadas ?? 0) + (faxinaD.paradas60 ?? 0)) > 0 && (
        <details className="fax">
          <summary>
            <span className="ft">🧹 <b>Limpar o pipeline</b> — pasta que não fecha engana a meta</span>
            <span className="pills"><span className="pill v">{faxinaD.reprovadas ?? 0} reprovadas</span><span className="pill m">{faxinaD.paradas60 ?? 0} paradas 60+ dias</span></span>
          </summary>
          <div className="body">
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "2px 0 8px" }}>Revisão em lote para quem decide — sem listar uma a uma.</p>
            {(faxinaD.revisao ?? []).map((r: any) => (
              <button className="rev" key={r.chave} onClick={() => pedirRevisao(r.nome, r.n)}>Pedir revisão a {r.nome} ({r.n})</button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
