// PlantaoEmpresa — check-in de plantão da EMPRESA TODA (C2S), em árvore que abre no clique:
// Diretoria → Superintendência → Gerente → Corretor.
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
.biv1 .pe-name{display:flex;align-items:center;gap:6px;min-width:0}
.biv1 .pe-name span.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.biv1 .pe-caret{width:14px;flex-shrink:0;color:#93C5FD;font-size:10px}
.biv1 .pe-tag{font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:999px;background:rgba(147,197,253,.16);color:#93C5FD;flex-shrink:0}
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
  key: string; nome: string; nivel: 0 | 1 | 2 | 3; empresa?: string;
  corretores: Set<string>; presencas: Set<string>; hoje: Set<string>;
  chegadas: number[]; estandes: Set<string>; ultimo: string | null;
  filhos: Map<string, No>;
};

// "Gerente Dudu" → "Dudu"; "Superintendencia LilianeViana" → "LilianeViana"; "Diretoria Ninho" → "Ninho"
const limpa = (s: string | null, fallback: string) =>
  (s || "").replace(/^(gerente|gerência|gerencia|superintendente|superintendência|superintendencia|diretoria|diretora|diretor)\s+/i, "").trim() || fallback;

const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const minutosSP = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");

function novoNo(key: string, nome: string, nivel: No["nivel"], empresa?: string): No {
  return { key, nome, nivel, empresa, corretores: new Set(), presencas: new Set(), hoje: new Set(), chegadas: [], estandes: new Set(), ultimo: null, filhos: new Map() };
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
    for (const l of linhas) {
      const cor = (l.corretor || "").trim().toUpperCase();
      if (!cor) continue;
      const dir = limpa(l.diretor, "Sem diretoria"), sup = limpa(l.superintendente, "Sem superintendência"), ger = limpa(l.gerente, "Sem gerente");
      const kDir = dir, kSup = `${dir}›${sup}`, kGer = `${kSup}›${ger}`, kCor = `${kGer}›${cor}`;
      const presenca = `${cor}|${l.dia}`;
      const chegada = l.check_in ? minutosSP(l.check_in) : null;
      gerentes.add(kGer); diasComDado.add(l.dia); if (l.estande) estandes.add(l.estande);

      let nDir = raiz.filhos.get(kDir); if (!nDir) { nDir = novoNo(kDir, dir, 0, l.empresa || ""); raiz.filhos.set(kDir, nDir); }
      let nSup = nDir.filhos.get(kSup); if (!nSup) { nSup = novoNo(kSup, sup, 1); nDir.filhos.set(kSup, nSup); }
      let nGer = nSup.filhos.get(kGer); if (!nGer) { nGer = novoNo(kGer, ger, 2); nSup.filhos.set(kGer, nGer); }
      let nCor = nGer.filhos.get(kCor); if (!nCor) { nCor = novoNo(kCor, (l.corretor || "").trim(), 3); nGer.filhos.set(kCor, nCor); }

      for (const n of [raiz, nDir, nSup, nGer, nCor]) {
        n.corretores.add(cor);
        if (!n.presencas.has(presenca)) { n.presencas.add(presenca); if (chegada !== null) n.chegadas.push(chegada); }
        if (l.dia === hoje) n.hoje.add(cor);
        if (l.estande) n.estandes.add(l.estande.replace(/^Estande\s*-\s*/i, ""));
        if (l.check_in && (!n.ultimo || l.check_in > n.ultimo)) n.ultimo = l.check_in;
      }
    }
    return { raiz, totais: { corretores: raiz.corretores.size, gerentes: gerentes.size, estandes: estandes.size, diretorias: raiz.filhos.size, dias: diasComDado.size } };
  }, [linhas, hoje]);

  const ordenar = (m: Map<string, No>) => [...m.values()].sort((a, b) => b.corretores.size - a.corretores.size || a.nome.localeCompare(b.nome));
  const maxDir = Math.max(1, ...[...raiz.filhos.values()].map((n) => n.corretores.size));
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const mediaDia = (n: No) => (totais.dias ? n.presencas.size / totais.dias : 0);
  const chegadaMedia = (n: No) => (n.chegadas.length ? hhmm(n.chegadas.reduce((a, b) => a + b, 0) / n.chegadas.length) : "—");

  const renderNo = (n: No): JSX.Element[] => {
    const temFilhos = n.filhos.size > 0;
    const aberto = abertos.has(n.key);
    const recuo = n.nivel * 18;
    const rotuloFilhos = n.nivel === 0 ? "superint." : n.nivel === 1 ? "gerentes" : "corretores";
    const linha = (
      <div key={n.key} className={`pe-row l${n.nivel}${temFilhos ? " click" : ""}`} onClick={temFilhos ? () => alternar(n.key) : undefined}>
        <div className="pe-name" style={{ paddingLeft: recuo }}>
          <span className="pe-caret">{temFilhos ? (aberto ? "▼" : "▶") : ""}</span>
          <span className="t" title={n.nome}>{n.nome}</span>
          {n.nivel === 0 && n.empresa ? <span className="pe-tag">{n.empresa}</span> : null}
          {temFilhos ? <span className="pe-tag pe-hide">{n.filhos.size} {rotuloFilhos}</span> : null}
          {n.nivel === 3 && n.estandes.size ? <span className="pe-tag pe-hide" title={[...n.estandes].join(", ")}>{[...n.estandes][0]}</span> : null}
        </div>
        <div className="pe-num">
          {n.nivel === 3 ? `${n.presencas.size}d` : nf(n.corretores.size)}
          {n.nivel === 0 ? <div className="pe-bar"><i style={{ width: `${(n.corretores.size / maxDir) * 100}%` }} /></div> : null}
        </div>
        <div className="pe-num">{dias === 1 ? nf(n.hoje.size) : n.nivel === 3 ? (n.hoje.size ? "✓" : "—") : nf(n.hoje.size)}</div>
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
          <p>Check-in no C2S · clique numa diretoria para abrir superintendências, gerentes e corretores</p>
        </div>
        <div className="hc-box">
          <label>Período</label>
          <select value={dias} onChange={(e) => { setDias(Number(e.target.value)); }}>
            <option value={1}>Hoje</option>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
      </div>

      <div className="pe-kpis">
        <div className="pe-kpi"><small>Corretores {dias === 1 ? "hoje" : `em ${dias} dias`}</small><b>{nf(totais.corretores)}</b></div>
        <div className="pe-kpi"><small>Presentes hoje</small><b>{nf(raiz.hoje.size)}</b></div>
        <div className="pe-kpi"><small>Gerentes · Diretorias</small><b>{nf(totais.gerentes)} · {nf(totais.diretorias)}</b></div>
        <div className="pe-kpi"><small>Estandes</small><b>{nf(totais.estandes)}</b></div>
      </div>

      <div className="pe-tree">
        <div className="pe-row hdr">
          <div>Diretoria › Superint. › Gerente › Corretor</div>
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
      {dias > 1 ? <p style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>* corretores distintos no período; no corretor, “Nd” = dias com check-in. Média/dia = presenças ÷ dias com dado.</p> : null}
    </div>
  );
}
