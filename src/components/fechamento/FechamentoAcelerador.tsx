import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "@/styles/fechamento.css";

/* Aceleração de Fechamento — topo da aba Pastas.
   Fonte: export diário "Pesquisa" (Cury), ingerido por fechamento_ingerir;
   leitura por fechamento_painel. Hierarquia v1 = colunas do próprio arquivo
   (Diretor→Gerente→Corretor). Cobrar = copia o texto por enquanto; a Régua
   entra na Fase 4 (precisa casar nome→perfil). */

type Periodo = "sem" | "mes" | "d7";
const sb = supabase as any;

// ---- datas (semana seg–dom, padrão da casa) ----
function janela(p: Periodo): [string, string] {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "mes") return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
  if (p === "d7") { const d = new Date(hoje); d.setDate(d.getDate() - 6); return [iso(d), iso(hoje)]; }
  const dow = (hoje.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(hoje); seg.setDate(seg.getDate() - dow);
  return [iso(seg), iso(hoje)];
}
const CMP: Record<Periodo, string> = { sem: "a semana passada", mes: "o mês passado", d7: "os 7 dias anteriores" };

const ACAO: Record<number, string> = {
  1: "completar a pasta (faltam docs)", 2: "resolver pendência (doc/renda)",
  3: "cobrar retorno do banco", 4: "emitir contrato · secretaria", 5: "confirmar escritura",
};
const ini = (s: string) => (s || "").slice(0, 2).toUpperCase();

// ---- leitura de CSV (UTF-8 com fallback 1252, como a Base de contatos) ----
async function lerCsv(f: File): Promise<string[][]> {
  const buf = await f.arrayBuffer();
  let txt: string;
  try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { txt = new TextDecoder("windows-1252").decode(buf); }
  txt = txt.replace(/^﻿/, "").replace(/\r/g, "");
  const sep = (txt.split("\n")[0].match(/;/g)?.length ?? 0) >= (txt.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return txt.split("\n").filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}
// "DD/MM/AAAA HH:MM:SS" -> ISO; vazio -> null
function dt(s: string): string | null {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
}
function dataDoArquivo(nome: string): string {
  const m = nome.match(/(\d{2})(\d{2})(\d{2})/); // PesquisaDDMMYY
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return new Date().toISOString().slice(0, 10);
}

export default function FechamentoAcelerador({ podeSubir = true }: { podeSubir?: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>("sem");
  const [dir, setDir] = useState<string | null>(null);
  const [ger, setGer] = useState<string | null>(null);
  const [etapaSel, setEtapaSel] = useState<number | null>(4); // começa nas aprovadas (dinheiro)
  const [d, setD] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [subindo, setSubindo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [de, ate] = useMemo(() => janela(periodo), [periodo]);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await sb.rpc("fechamento_painel", {
      p_de: de, p_ate: ate, p_diretor: dir, p_gerente: ger, p_etapa: etapaSel,
    });
    setCarregando(false);
    if (error) { toast.error("Não consegui ler o painel: " + error.message); return; }
    setD(data);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [de, ate, dir, ger, etapaSel]);

  async function subir(f?: File) {
    if (!f) return;
    setSubindo(true);
    try {
      const linhas = await lerCsv(f);
      const corpo = linhas.slice(1).filter((c) => c.length >= 13 && c[1]?.trim());
      const rows = corpo.map((c) => ({
        cod: c[1], cliente: c[2], emp: c[3], bloco: c[4], uni: c[5],
        corr: c[6], ger: c[7], dir: c[8], status: c[12],
        cadastro: dt(c[0]), contato: dt(c[10]),
      }));
      if (!rows.length) { toast.error("Arquivo sem linhas válidas."); setSubindo(false); return; }
      const pData = dataDoArquivo(f.name);
      const { data, error } = await sb.rpc("fechamento_ingerir", { p_data: pData, p_rows: rows });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      toast.success(`Pesquisa de ${pData.split("-").reverse().join("/")} carregado: ${r?.linhas ?? rows.length} linhas · ${r?.mudancas ?? 0} mudanças`);
      await carregar();
    } catch (e: any) {
      toast.error("Falha ao carregar: " + (e?.message ?? e));
    } finally {
      setSubindo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const fluxo = d?.fluxo ?? {};
  const funil = d?.funil ?? {};
  const porEtapa: any[] = d?.por_etapa ?? [];
  const ranking: any[] = d?.ranking ?? [];
  const salvar: any[] = d?.salvar ?? [];
  const nivel = d?.nivel ?? "diretor";
  const temFilho = nivel !== "corretor";

  // ---- desenho da semana (sugestões por regra, do dado real) ----
  const sugestoes = useMemo(() => {
    const byO = (o: number) => porEtapa.find((e) => e.ordem === o)?.n ?? 0;
    const out: [string, string][] = [];
    if (byO(4)) out.push(["💰", `<b>${byO(4)} aprovadas sem contrato</b> esperando emissão — cobrar a secretaria é o fechamento mais rápido.`]);
    if (byO(2)) out.push(["📎", `<b>${byO(2)} com pendência</b> travando o banco — resolver documento/renda destrava.`]);
    if (byO(3)) out.push(["🏦", `<b>${byO(3)} em análise bancária</b> — cobrar o retorno da Caixa pelas mais antigas.`]);
    if (!out.length) out.push(["📥", "Suba o <b>Pesquisa de hoje</b> pra ver o que a equipe moveu e o que dá pra salvar."]);
    return out;
  }, [porEtapa]);

  const delta = (a: number, b: number) => {
    const x = (a ?? 0) - (b ?? 0);
    return <span className={x >= 0 ? "gud" : "bad"}>{x >= 0 ? "▲ +" : "▼ −"}{Math.abs(x)}</span>;
  };
  const conv = (a: number, b: number) => (a ? Math.round((b / a) * 100) : 0);

  function cobrar(s: any) {
    const txt = `Cobrança de fechamento — ${s.cliente} (${s.etapa})\nCorretor: ${s.corretor}\nO que falta: ${ACAO[s.ordem] ?? s.etapa}\nParada há ${s.dias} dia(s).`;
    navigator.clipboard?.writeText(txt).then(
      () => toast.success("Texto de cobrança copiado. (A Régua automática entra na próxima etapa.)"),
      () => toast.message(txt),
    );
  }

  const crumb = (() => {
    const parts: { nome: string; onClick?: () => void }[] = [{ nome: "Diretoria", onClick: () => { setDir(null); setGer(null); } }];
    if (dir) parts.push({ nome: dir, onClick: () => setGer(null) });
    if (ger) parts.push({ nome: ger });
    return parts;
  })();
  const nivelLabel = nivel === "diretor" ? "VENDO POR SUPERINTENDÊNCIA" : nivel === "gerente" ? "VENDO POR GERÊNCIA" : "VENDO POR CORRETOR";

  return (
    <div className="fech">
      <div className="ftop">
        <div>
          <h2 className="ftit">🚀 Aceleração de Fechamento</h2>
          <p className="fsub">O que a equipe moveu e o que dá pra salvar. Pasta sem movimento há +60 dias fica na faxina.</p>
        </div>
        <div>
          <div className="per">
            {(["sem", "mes", "d7"] as Periodo[]).map((p) => (
              <b key={p} className={periodo === p ? "on" : ""} onClick={() => setPeriodo(p)}>
                {p === "sem" ? "Esta semana" : p === "mes" ? "Este mês" : "7 dias"}
              </b>
            ))}
          </div>
          <div className="cmp">comparando com <b>{CMP[periodo]}</b></div>
          {podeSubir && (
            <div className="up">
              <button onClick={() => fileRef.current?.click()} disabled={subindo}>
                {subindo ? "Carregando…" : "⬆ Enviar o Pesquisa de hoje"}
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => subir(e.target.files?.[0])} />
              <small>{d?.ultima_carga ? `último dia carregado: ${String(d.ultima_carga).split("-").reverse().join("/")} · ${d.dias_de_dado} dia(s) de histórico` : "nenhum arquivo carregado ainda"}</small>
            </div>
          )}
        </div>
      </div>

      {/* breadcrumb */}
      <div className="bc">
        {crumb.map((c, i) => (
          <span key={i} style={{ display: "contents" }}>
            <b className={i === crumb.length - 1 ? "cur" : ""} onClick={c.onClick}>{c.nome}</b>
            {i < crumb.length - 1 ? <span>›</span> : null}
          </span>
        ))}
        <span className="lv">{nivelLabel}</span>
      </div>

      {/* desenho da semana */}
      <div className="plan">
        <h3>🗺️ Desenho da semana <span className="pill">sugestões por regra</span></h3>
        <ul>
          {sugestoes.map((s, i) => (
            <li key={i}><span>{s[0]}</span><span dangerouslySetInnerHTML={{ __html: s[1] }} /></li>
          ))}
        </ul>
      </div>

      {/* 3 números */}
      <div className="hero">
        <div className="hc s1"><div className="lbl">Subiram p/ análise</div><div className="big">{fluxo.subiram ?? 0}</div>
          <div className="d">{delta(fluxo.subiram, fluxo.subiram_ant)}<span className="prev">· antes {fluxo.subiram_ant ?? 0}</span></div></div>
        <div className="hc s2"><div className="lbl">Aprovaram (SICAQ)</div><div className="big">{fluxo.aprovaram ?? 0}</div>
          <div className="d">{delta(fluxo.aprovaram, fluxo.aprovaram_ant)}<span className="prev">· antes {fluxo.aprovaram_ant ?? 0}</span></div></div>
        <div className="hc s3"><div className="lbl">Assinaram contrato</div><div className="big">{fluxo.assinaram ?? 0}</div>
          <div className="d">{delta(fluxo.assinaram, fluxo.assinaram_ant)}<span className="prev">· antes {fluxo.assinaram_ant ?? 0}</span></div></div>
      </div>

      {/* dois quadros */}
      <div className="quad">
        <div className="card">
          <div className="ch"><h3>📈 O que subiu</h3><span className="hint">fluxo do período</span></div>
          <div className="funil">
            <div className="fl">
              <div className="fstep"><div className="n">{funil.entraram ?? 0}</div><div className="t">Entraram</div></div>
              <div className="conv"><div className="pct">{conv(funil.entraram, funil.subiram)}%</div><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
              <div className="fstep"><div className="n">{funil.subiram ?? 0}</div><div className="t">Subiram</div></div>
              <div className="conv bad"><div className="pct">{conv(funil.subiram, funil.aprovadas)}%</div><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
              <div className="fstep"><div className="n">{funil.aprovadas ?? 0}</div><div className="t">Aprovadas</div></div>
              <div className="conv"><div className="pct">{conv(funil.aprovadas, funil.assinadas)}%</div><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
              <div className="fstep"><div className="n">{funil.assinadas ?? 0}</div><div className="t">Assinadas</div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><h3>📍 Onde está parado</h3><span className="hint">etapas do Junix · clique p/ filtrar</span></div>
          <div className="mapa">
            {porEtapa.length ? porEtapa.map((e) => (
              <button key={e.ordem} className={`stg ${e.ordem === 4 ? "money" : ""} ${etapaSel === e.ordem ? "sel" : ""}`} onClick={() => setEtapaSel(e.ordem)}>
                <span className="em">{({ 1: "📁", 2: "📎", 3: "🏦", 4: "✅", 5: "✍️" } as any)[e.ordem] ?? "•"}</span>
                <span className="snm"><b>{e.etapa}</b><span>{ACAO[e.ordem]}</span></span>
                <span className="ct">{e.n}</span>
                <span className={`own ${e.dono === "-" ? "none" : e.dono}`}>{e.dono === "-" ? "—" : e.dono}</span>
              </button>
            )) : <div className="vazio">{carregando ? "Carregando…" : "Sem pasta viva no recorte. Suba o Pesquisa de hoje."}</div>}
          </div>
        </div>
      </div>

      {/* ranking + salvar */}
      <div className="grid">
        <div className="card">
          <div className="ch"><h3>Como a equipe está indo</h3><span className="hint">{temFilho ? "clique p/ entrar" : "corretores"}</span></div>
          <div className="rk">
            <table>
              <thead><tr><th>Quem</th><th>Subiu</th><th>Análise</th><th>Aprovou</th><th>Assinou</th></tr></thead>
              <tbody>
                {ranking.length ? ranking.map((r) => (
                  <tr key={r.chave} className={temFilho ? "has" : ""} onClick={() => { if (!temFilho) return; nivel === "diretor" ? setDir(r.chave) : setGer(r.chave); }}>
                    <td><span className="nm2"><span className="av">{ini(r.nome || r.chave)}</span>{r.nome || r.chave}{temFilho ? <span className="drill">entrar ›</span> : null}</span></td>
                    <td className={r.subiu ? "" : "z"}>{r.subiu}</td>
                    <td className={r.analise ? "" : "z"}>{r.analise}</td>
                    <td className={r.aprovou ? "" : "z"}>{r.aprovou}</td>
                    <td className={r.assinou ? "assv" : "z"}>{r.assinou}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="z" style={{ textAlign: "center", padding: 16 }}>
                  {carregando ? "Carregando…" : "O ranking enche conforme os dias vão sendo carregados (precisa de 2+ dias de diff)."}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="ch"><h3>Pra salvar</h3><span className="hint">só pasta viva</span></div>
          <div className="save">
            {salvar.length ? salvar.map((s) => (
              <div className="row" key={s.cod}>
                <div className="who"><b>{s.cliente}</b><span>c/ {s.corretor} · {s.etapa}</span></div>
                <span className="act">{ACAO[s.ordem] ?? s.etapa}</span>
                <span className={`dias ${s.dias > 10 ? "red" : ""}`}>{s.dias} d</span>
                <button className={`cob ${s.ordem === 4 ? "allg" : ""}`} onClick={() => cobrar(s)}>⚡ Cobrar</button>
              </div>
            )) : <div className="vazio">{carregando ? "Carregando…" : "Nada pendente no recorte."}</div>}
          </div>
        </div>
      </div>

      {(d?.backlog ?? 0) > 0 && (
        <div className="faxina">
          <div className="t">🧹 <b>{d.backlog} pastas</b> sem movimento há +60 dias — decisão de distrato/arquivo, não cobrança.</div>
        </div>
      )}
    </div>
  );
}
