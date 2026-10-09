// PlantaoEmpresa — check-in de plantão da EMPRESA TODA (C2S), em árvore que abre no clique.
// Dois jeitos de olhar:
//   Hierarquia: Diretoria → Superintendência → Gerente → Corretor (+ onde cada time se concentra)
//   Estande:    Estande → Diretoria → Gerente → Corretor (quem está apostando em qual estande)
// Fonte: public.c2s_plantao (conector /root/c2s/plantao.py, cron a cada 30 min), 1 linha por
// corretor × estande × dia. Vive dentro do .biv1 do BiTab e herda o tema navy dele.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CSS = `
.biv1 .pe-wrap{max-width:1640px;margin:0 auto;padding:16px 20px 22px}
.biv1 .pe-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.biv1 .pe-head h2{font-size:18px;font-weight:800;text-transform:uppercase;color:#0F172A}
.biv1 .pe-head p{font-size:12px;color:#334155;margin-top:2px}
.biv1 .pe-ctrls{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}
.biv1 .pe-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
@media(max-width:820px){.biv1 .pe-kpis{grid-template-columns:repeat(2,1fr)}}
.biv1 .pe-kpi{background:var(--navy-cury);border:1px solid #1C508D;border-radius:10px;padding:10px 14px;color:#fff}
.biv1 .pe-kpi small{display:block;font-size:10.5px;font-weight:700;color:#93C5FD;text-transform:uppercase}
.biv1 .pe-kpi b{font-family:var(--mono);font-size:22px;font-weight:800}
.biv1 .pe-tree{background:var(--navy-cury);border:1px solid #1C508D;border-radius:10px;overflow:hidden;color:#fff}
.biv1 .pe-row{display:grid;grid-template-columns:minmax(0,1fr) 92px 92px 92px 84px;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07);font-size:12.5px}
.biv1 .pe-row.hdr{background:var(--navy-cury-dark);font-size:10.5px;font-weight:800;color:#93C5FD;text-transform:uppercase;position:sticky;top:0}
.biv1 .pe-row.click{cursor:pointer}
.biv1 .pe-row.click:hover{background:var(--navy-hover)}
.biv1 .pe-row.l0{background:var(--navy-row-1);font-weight:800;font-size:13.5px}
.biv1 .pe-row.l1{background:var(--navy-row-2);font-weight:700}
.biv1 .pe-row.l2{font-weight:600}
.biv1 .pe-row.l3{color:#CBD5E1;font-size:12px}
.biv1 .pe-name{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
.biv1 .pe-name span.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.biv1 .pe-caret{width:14px;flex-shrink:0;color:#93C5FD;font-size:10px}
.biv1 .pe-tag{font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:999px;background:rgba(147,197,253,.16);color:#93C5FD;flex-shrink:0;white-space:nowrap}
.biv1 .pe-tag.foco{background:rgba(250,204,21,.16);color:var(--gold)}
.biv1 .pe-tag.fisico{background:rgba(74,222,128,.15);color:var(--green-bright)}
.biv1 .pe-tag.lanc{background:rgba(244,114,182,.16);color:#F9A8D4}
.biv1 .pe-tag.fila{background:rgba(148,163,184,.18);color:#CBD5E1}
.biv1 .pe-num{text-align:right;font-family:var(--mono);font-weight:700}
.biv1 .pe-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:3px;overflow:hidden}
.biv1 .pe-bar i{display:block;height:100%;background:#38BDF8}
.biv1 .pe-empty{padding:40px 20px;text-align:center;color:#CBD5E1}
@media(max-width:640px){
  .biv1 .pe-row{grid-template-columns:minmax(0,1fr) 64px 64px;padding:8px}
  .biv1 .pe-row .pe-hide{display:none}
}
`;

type Linha = {
  dia: string; corretor: string | null; gerente: string | null; superintendente: string | null;
  diretor: string | null; empresa: string | null; estande: string | null; check_in: string | null;
};

type No = {
  key: string; nome: string; nivel: 0 | 1 | 2 | 3; tag?: string;
  corretores: Set<string>; presencas: Set<string>; hoje: Set<string>;
  chegadas: number[]; porEstande: Map<string, Set<string>>;
  filhos: Map<string, No>;
};

type Modo = "hier" | "estande";
type TipoEstande = "fisico" | "lanc" | "fila";

// "Gerente Dudu" → "Dudu"; "Superintendencia LilianeViana" → "LilianeViana"; "Diretoria Ninho" → "Ninho"
const limpa = (s: string | null, fallback: string) =>
  (s || "").replace(/^(gerente|gerência|gerencia|superintendente|superintendência|superintendencia|diretoria|diretora|diretor)\s+/i, "").trim() || fallback;
const limpaEstande = (s: string | null) => (s || "").replace(/^Estande\s*-?\s*/i, "").trim() || "Sem estande";

// O C2S chama de "estande" também as filas/roletas de anúncio de uma equipe.
const tipoEstande = (nome: string): TipoEstande =>
  /lan[cç]amento/i.test(nome) ? "lanc"
  : /^eq\b|fila|an[uú]ncio|campanha|igualit|geral|jaguar|^dias\b/i.test(nome) ? "fila"
  : "fisico";
const ROTULO_TIPO: Record<TipoEstande, string> = { fisico: "estande", lanc: "lançamento", fila: "fila/anúncio" };

const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const minutosSP = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const pctTxt = (p: number) => `${Math.round(p * 100)}%`;

function novoNo(key: string, nome: string, nivel: No["nivel"], tag?: string): No {
  return { key, nome, nivel, tag, corretores: new Set(), presencas: new Set(), hoje: new Set(), chegadas: [], porEstande: new Map(), filhos: new Map() };
}

// PostgREST corta em 1000 linhas: busca em páginas até acabar.
async function buscarPlantao(de: string): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("c2s_plantao" as any)
      .select("dia, corretor, gerente, superintendente, diretor, empresa, estande, check_in")
      .gte("dia", de).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as unknown as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function PlantaoEmpresa() {
  const [dias, setDias] = useState(1);
  const [modo, setModo] = useState<Modo>("hier");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const hoje = diaSP(new Date());
  const de = diaSP(new Date(Date.now() - (dias - 1) * 86400000));

  const { data: linhas = [], isLoading, error } = useQuery({
    queryKey: ["plantaoEmpresa", de],
    queryFn: () => buscarPlantao(de),
    refetchInterval: 5 * 60 * 1000,
  });

  const { raiz, totais } = useMemo(() => {
    const raiz = novoNo("root", "Empresa", 0);
    const gerentes = new Set<string>(), estandes = new Set<string>(), diasComDado = new Set<string>();
    const fisicos = new Set<string>();
    for (const l of linhas) {
      const cor = (l.corretor || "").trim().toUpperCase();
      if (!cor) continue;
      const dir = limpa(l.diretor, "Sem diretoria"), sup = limpa(l.superintendente, "Sem superintendência"), ger = limpa(l.gerente, "Sem gerente");
      const est = limpaEstande(l.estande);
      const tipo = tipoEstande(est);
      gerentes.add(`${dir}›${sup}›${ger}`); diasComDado.add(l.dia); estandes.add(est); if (tipo === "fisico") fisicos.add(est);

      // caminho da árvore conforme o modo
      const caminho: [string, string | undefined][] = modo === "hier"
        ? [[dir, l.empresa || undefined], [sup, undefined], [ger, undefined], [(l.corretor || "").trim(), undefined]]
        : [[est, tipo], [dir, l.empresa || undefined], [ger, undefined], [(l.corretor || "").trim(), undefined]];

      const presenca = `${cor}|${l.dia}`;
      const chegada = l.check_in ? minutosSP(l.check_in) : null;
      const nos: No[] = [raiz];
      let pai = raiz, chave = "";
      caminho.forEach(([nome, tag], i) => {
        chave += `›${i === 3 ? cor : nome}`;
        let n = pai.filhos.get(chave);
        if (!n) { n = novoNo(chave, nome, i as No["nivel"], tag); pai.filhos.set(chave, n); }
        nos.push(n); pai = n;
      });

      for (const n of nos) {
        n.corretores.add(cor);
        if (!n.presencas.has(presenca)) { n.presencas.add(presenca); if (chegada !== null) n.chegadas.push(chegada); }
        if (l.dia === hoje) n.hoje.add(cor);
        let s = n.porEstande.get(est); if (!s) { s = new Set(); n.porEstande.set(est, s); } s.add(cor);
      }
    }
    return { raiz, totais: { corretores: raiz.corretores.size, gerentes: gerentes.size, estandes: estandes.size, fisicos: fisicos.size, diretorias: new Set(linhas.map((l) => l.diretor)).size, dias: diasComDado.size } };
  }, [linhas, hoje, modo]);

  const ordenar = (m: Map<string, No>) => [...m.values()].sort((a, b) => b.corretores.size - a.corretores.size || a.nome.localeCompare(b.nome));
  const maxTopo = Math.max(1, ...[...raiz.filhos.values()].map((n) => n.corretores.size));
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const mudarModo = (m: Modo) => { setModo(m); setAbertos(new Set()); };
  const mediaDia = (n: No) => (totais.dias ? n.presencas.size / totais.dias : 0);
  const chegadaMedia = (n: No) => (n.chegadas.length ? hhmm(n.chegadas.reduce((a, b) => a + b, 0) / n.chegadas.length) : "—");
  // estande onde o time mais se concentra (corretores distintos)
  const foco = (n: No) => {
    let melhor: [string, number] | null = null;
    for (const [e, s] of n.porEstande) if (!melhor || s.size > melhor[1]) melhor = [e, s.size];
    return melhor && n.corretores.size ? { nome: melhor[0], pct: melhor[1] / n.corretores.size } : null;
  };

  const rotuloFilhos = (nivel: number) => modo === "hier"
    ? (nivel === 0 ? "superint." : nivel === 1 ? "gerentes" : "corretores")
    : (nivel === 0 ? "diretorias" : nivel === 1 ? "gerentes" : "corretores");

  const renderNo = (n: No): JSX.Element[] => {
    const temFilhos = n.filhos.size > 0;
    const aberto = abertos.has(n.key);
    const f = modo === "hier" && n.nivel < 3 ? foco(n) : null;
    const estandesCorretor = n.nivel === 3 ? [...n.porEstande.keys()] : [];
    const linha = (
      <div key={n.key} className={`pe-row l${n.nivel}${temFilhos ? " click" : ""}`} onClick={temFilhos ? () => alternar(n.key) : undefined}>
        <div className="pe-name" style={{ paddingLeft: n.nivel * 18 }}>
          <span className="pe-caret">{temFilhos ? (aberto ? "▼" : "▶") : ""}</span>
          <span className="t" title={n.nome}>{n.nome}</span>
          {modo === "estande" && n.nivel === 0 && n.tag ? <span className={`pe-tag ${n.tag}`}>{ROTULO_TIPO[n.tag as TipoEstande]}</span> : null}
          {modo === "estande" && n.nivel === 0 ? <span className="pe-tag foco">{pctTxt(n.corretores.size / Math.max(1, totais.corretores))} da empresa</span> : null}
          {((modo === "hier" && n.nivel === 0) || (modo === "estande" && n.nivel === 1)) && n.tag ? <span className="pe-tag">{n.tag}</span> : null}
          {temFilhos ? <span className="pe-tag pe-hide">{n.filhos.size} {rotuloFilhos(n.nivel)}</span> : null}
          {f ? <span className="pe-tag foco" title="Estande com mais corretores deste time">📍 {f.nome} {pctTxt(f.pct)}</span> : null}
          {modo === "hier" && estandesCorretor.length ? <span className="pe-tag pe-hide" title={estandesCorretor.join(", ")}>{estandesCorretor[0]}{estandesCorretor.length > 1 ? ` +${estandesCorretor.length - 1}` : ""}</span> : null}
        </div>
        <div className="pe-num">
          {n.nivel === 3 ? `${n.presencas.size}d` : nf(n.corretores.size)}
          {n.nivel === 0 ? <div className="pe-bar"><i style={{ width: `${(n.corretores.size / maxTopo) * 100}%` }} /></div> : null}
        </div>
        <div className="pe-num">{n.nivel === 3 && dias > 1 ? (n.hoje.size ? "✓" : "—") : nf(n.hoje.size)}</div>
        <div className="pe-num pe-hide">{n.nivel === 3 ? "" : mediaDia(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</div>
        <div className="pe-num pe-hide">{chegadaMedia(n)}</div>
      </div>
    );
    if (!temFilhos || !aberto) return [linha];
    return [linha, ...ordenar(n.filhos).flatMap(renderNo)];
  };

  return (
    <div className="pe-wrap">
      <style>{CSS}</style>
      <div className="pe-head">
        <div>
          <h2>📍 Plantão — Empresa toda</h2>
          <p>Check-in no C2S · {modo === "hier" ? "clique numa diretoria para abrir superintendências, gerentes e corretores · 📍 = estande onde o time se concentra" : "clique num estande para ver quais diretorias, gerentes e corretores estão nele"}</p>
        </div>
        <div className="pe-ctrls">
          <div className="hc-buttons">
            <button className={`hc-btn${modo === "hier" ? " active" : ""}`} onClick={() => mudarModo("hier")}>🏢 Hierarquia</button>
            <button className={`hc-btn${modo === "estande" ? " active" : ""}`} onClick={() => mudarModo("estande")}>📍 Estande</button>
          </div>
          <div className="hc-box">
            <label>Período</label>
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              <option value={1}>Hoje</option>
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pe-kpis">
        <div className="pe-kpi"><small>Corretores {dias === 1 ? "hoje" : `em ${dias} dias`}</small><b>{nf(totais.corretores)}</b></div>
        <div className="pe-kpi"><small>Presentes hoje</small><b>{nf(raiz.hoje.size)}</b></div>
        <div className="pe-kpi"><small>Gerentes · Diretorias</small><b>{nf(totais.gerentes)} · {nf(totais.diretorias)}</b></div>
        <div className="pe-kpi"><small>Estandes · físicos</small><b>{nf(totais.estandes)} · {nf(totais.fisicos)}</b></div>
      </div>

      <div className="pe-tree">
        <div className="pe-row hdr">
          <div>{modo === "hier" ? "Diretoria › Superint. › Gerente › Corretor" : "Estande › Diretoria › Gerente › Corretor"}</div>
          <div className="pe-num">{dias === 1 ? "Corretores" : "Corretores*"}</div>
          <div className="pe-num">Hoje</div>
          <div className="pe-num pe-hide">Média/dia</div>
          <div className="pe-num pe-hide">Chegada</div>
        </div>
        {isLoading ? <div className="pe-empty">Carregando o plantão…</div>
          : error ? <div className="pe-empty">Não consegui ler o plantão agora.</div>
          : !raiz.filhos.size ? <div className="pe-empty">Nenhum check-in no período ainda.</div>
          : ordenar(raiz.filhos).flatMap(renderNo)}
      </div>
      <p style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
        {dias > 1 ? "* corretores distintos no período; no corretor, “Nd” = dias com check-in. Média/dia = presenças ÷ dias com dado. " : ""}
        “fila/anúncio” = roleta de anúncio que o C2S também chama de estande.
      </p>
    </div>
  );
}
