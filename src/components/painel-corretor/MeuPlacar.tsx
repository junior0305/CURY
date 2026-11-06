// Meu Placar (06/11, protótipo aprovado https://claude.ai/artifact/PYVcbUuhJxEdtzF9kzvQo3).
// Pódio = top 5 da diretoria (só nome e pontos). Fora do top 5 o corretor não vê a posição: vê quanto falta
// para o top 10 da empresa, já traduzido em pastas e visitas. Comissão em faixa (vendas possíveis × placar_comissao).
// Pontos: visita 1 · pasta 3 · venda 10. Tudo vem da RPC meu_placar (regra fixa, sem IA).
// MeuPlacar = a tela (aba Placar do celular, gaveta do computador); PlacarFaixa = a linha que fica no Hoje.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Podio = { pos: number; id: string; nome: string; pontos: number; hoje: number; eu: boolean; ontem_pos: number | null };
export type Placar = {
  ok: boolean; eu: { nome: string; visitas: number; docs: number; vendas: number; pontos: number; hoje: number };
  podio: Podio[]; no_podio: boolean; pos: number | null; dias_lider: number; top10: boolean; falta_top10: number | null;
  ameaca: { nome: string; diff: number; visitas_marcadas: number; docs_semana: number } | null;
  acima: { nome: string; diff: number } | null;
  comissao: { min: number; max: number; possiveis: number; falta_visitas: number };
  quentes: number; parados: number; pasta: { lead_id: string; nome: string; falta: string | null } | null;
  premio: string | null; dias_restam: number;
};

export function usePlacar(uid: string) {
  return useQuery<Placar>({
    queryKey: ["meuPlacar", uid], enabled: !!uid, refetchInterval: 120_000, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("meu_placar"); if (error) throw error; return data; },
  });
}

const primeiro = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";
const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
const mil = (v: number) => v >= 1000 ? `${Math.round(v / 1000)} mil` : `${v}`;
const faixa = (c: Placar["comissao"], vendas: number) => `R$ ${mil(c.min * vendas)} a ${mil(c.max * vendas)}`;
const pts = (n: number) => `${n} ponto${n === 1 ? "" : "s"}`;
/** pontos que faltam em ações: pasta vale 3, visita vale 1 */
const emAcoes = (p: number) => {
  if (p <= 2) return `${p} visita${p === 1 ? "" : "s"}`;
  const pastas = Math.ceil(p / 3), resto = p - 3;
  return resto > 0 && resto <= 6 ? `${pastas} pasta${pastas === 1 ? "" : "s"}, ou 1 pasta e ${resto} visita${resto === 1 ? "" : "s"}` : `${pastas} pasta${pastas === 1 ? "" : "s"}`;
};
const movimento = (p: Podio, diasLider: number) => {
  if (p.pos === 1 && diasLider > 1) return { t: `líder há ${diasLider} dias`, c: "mp-ouro" };
  if (p.hoje > 0) return { t: `+${p.hoje} hoje`, c: "mp-verde" };
  if (p.ontem_pos && p.ontem_pos > p.pos) return { t: `subiu ${p.ontem_pos - p.pos}`, c: "mp-verde" };
  if (p.ontem_pos && p.ontem_pos < p.pos) return { t: `caiu ${p.pos - p.ontem_pos}`, c: "mp-verm" };
  return null;
};

const CSS = `
.mp{--mp-bg:#0B1626;--mp-card:#13233A;--mp-borda:#2A4468;--mp-muted:#9FB0C3;--mp-ouro:#F5C451;color:#EAF0F7;background:var(--mp-bg);font-family:Inter,system-ui,sans-serif;display:grid;gap:16px;padding:18px 16px 24px;border-radius:18px}
.mp h2{margin:0;font-size:26px;font-weight:800}
.mp-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.mp-m{font-size:13px;color:var(--mp-muted)}
.mp-cap{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.mp-premio{border:1.5px solid var(--mp-ouro);background:rgba(245,196,81,.1);border-radius:14px;padding:12px 14px;font-weight:700}
.mp-parab{background:#3A3320;border:1.5px solid var(--mp-ouro);border-radius:16px;padding:14px;display:flex;gap:12px;align-items:center}
.mp-parab b{color:var(--mp-ouro);font-size:17px}
.mp-podio{background:linear-gradient(180deg,#1A2B45,#10203A);border:1px solid var(--mp-borda);border-radius:20px;padding:16px 12px 0;display:grid;gap:6px;overflow:hidden}
.mp-degraus{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:end;margin-top:12px}
.mp-col{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.mp-col b{font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-av{border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;border:3px solid}
.mp-deg{width:100%;border-radius:12px 12px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-weight:800}
.mp-deg i{font-style:normal;font-family:'Space Grotesk',Inter,sans-serif;font-size:30px}
.mp-eu-tag{background:var(--mp-ouro);color:#241A05;font-size:11px;font-weight:900;letter-spacing:.08em;border-radius:999px;padding:2px 8px}
.mp-lin{background:var(--mp-card);border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.mp-lin.eu{background:#3A3320;border:2px solid var(--mp-ouro)}
.mp-lin.ameaca{background:#3B1D18;border:1px solid #A3473A}
.mp-vaga{border:1.5px dashed var(--mp-ouro);background:rgba(245,196,81,.07);border-radius:14px;padding:14px;display:grid;gap:6px}
.mp-vaga b{color:var(--mp-ouro);font-size:16px}
.mp-alerta{border-radius:16px;padding:14px 16px;display:grid;gap:6px;line-height:1.45}
.mp-alerta.ruim{background:#3B1D18;border:1px solid #A3473A}
.mp-alerta.bom{background:#12362F;border:1px solid #2BB5A0}
.mp-din{background:#12362F;border:1px solid #2BB5A0;border-radius:16px;padding:14px 16px;display:grid;gap:4px}
.mp-din strong{font-family:'Space Grotesk',Inter,sans-serif;font-size:24px}
.mp-acao{all:unset;box-sizing:border-box;cursor:pointer;background:#16263B;border-radius:14px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px;width:100%}
.mp-acao span:last-child{color:#5FD3BF;font-weight:800;font-size:14px}
.mp-acao:focus-visible{outline:2px solid #5FD3BF}
.mp-num{background:var(--mp-card);border-radius:14px;padding:12px 14px}
.mp-num summary{cursor:pointer;font-weight:700}
.mp-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.mp-grade b{font-size:20px;display:block}
.mp-ouro{color:var(--mp-ouro)}.mp-verde{color:#5FD3BF}.mp-verm{color:#F7A08A}
`;
// ouro, prata, bronze
const COR = [
  { av: "#3A3320", borda: "#F5C451", deg: "linear-gradient(180deg,#F5C451,#C9922A)", txt: "#241A05", h: 128, tam: 64 },
  { av: "#2E3E55", borda: "#C9D3DF", deg: "linear-gradient(180deg,#C9D3DF,#8E9BAE)", txt: "#0B1626", h: 92, tam: 54 },
  { av: "#3A2A20", borda: "#D08B57", deg: "linear-gradient(180deg,#D08B57,#9B5B30)", txt: "#1F1006", h: 70, tam: 50 },
];

export default function MeuPlacar({ uid, onAbrir, onFiltro, numeros, titulo = true }: {
  uid: string; onAbrir: (leadId: string) => void; onFiltro: (f: "quentes" | "parados") => void; numeros?: ReactNode; titulo?: boolean;
}) {
  const { data: p, isLoading, error } = usePlacar(uid);
  if (isLoading) return <div className="mp"><style>{CSS}</style><span className="mp-m">Carregando o placar…</span></div>;
  if (error || !p?.ok) return <div className="mp"><style>{CSS}</style><span className="mp-m">O placar não carregou agora. Tente de novo em instantes.</span></div>;

  const eu = p.eu, c = p.comissao;
  const top3 = [p.podio[1], p.podio[0], p.podio[2]]; // 2º, 1º, 3º
  const resto = p.podio.slice(3);
  const quinto = p.podio[4]?.pontos;
  const faltaPodio = quinto != null ? Math.max(1, quinto - eu.pontos + 1) : 1;

  const degrau = (x: Podio | undefined, i: number) => {
    if (!x) return <div key={i} />;
    const k = x.pos - 1, cor = COR[k], mv = movimento(x, p.dias_lider);
    return (
      <div key={x.id} className="mp-col">
        {x.pos === 1 && <svg width="32" height="22" viewBox="0 0 34 24" aria-hidden="true"><path d="M2 20 L5 6 L12 13 L17 2 L22 13 L29 6 L32 20 Z" fill="#F5C451" stroke="#B8891E" strokeWidth="1.5" strokeLinejoin="round" /></svg>}
        {x.eu && <span className="mp-eu-tag">VOCÊ</span>}
        <div className="mp-av" style={{ width: cor.tam, height: cor.tam, background: cor.av, borderColor: x.eu ? "#F5C451" : cor.borda, fontSize: cor.tam / 3, boxShadow: x.pos === 1 || x.eu ? "0 0 0 6px rgba(245,196,81,.18)" : undefined }}>{iniciais(x.nome)}</div>
        <b className={x.eu ? "mp-ouro" : undefined}>{primeiro(x.nome)}</b>
        <span className={`mp-m ${mv?.c || ""}`} style={{ fontWeight: 700, minHeight: 16 }}>{mv?.t || ""}</span>
        <div className="mp-deg" style={{ height: cor.h, background: cor.deg, color: cor.txt, outline: x.eu ? "3px solid #F5C451" : undefined, outlineOffset: -3 }}>
          <i>{x.pos}</i><span style={{ fontSize: 13 }}>{x.pontos} pts</span>
        </div>
      </div>);
  };

  return (
    <div className="mp">
      <style>{CSS}</style>
      {titulo ? <div className="mp-top"><h2>Meu Placar</h2><span className="mp-m">faltam {p.dias_restam} dias</span></div>
        : <span className="mp-m">faltam {p.dias_restam} dias para o pódio fechar</span>}
      {p.premio && <div className="mp-premio">🏆 Prêmio do mês: {p.premio}</div>}

      {p.no_podio && p.pos && (
        <div className="mp-parab">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#F5C451" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></svg>
          <div style={{ display: "grid", gap: 3 }}><b>Parabéns, {primeiro(eu.nome)}! Você está no pódio.</b>
            <span className="mp-m" style={{ color: "#E8D9B5" }}>{p.pos}º lugar da diretoria. A diretoria inteira está vendo o seu nome.</span></div>
        </div>)}

      {p.podio.length === 0 ? (
        <div className="mp-vaga"><b>O pódio está vazio.</b><span>Ninguém pontuou ainda este mês. A sua 1ª visita já te coloca lá em cima.</span></div>
      ) : <>
        <div className="mp-podio">
          <div className="mp-top"><span className="mp-cap mp-ouro">Pódio da diretoria</span><span className="mp-m">ao vivo</span></div>
          <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>O pódio fecha no último dia do mês. Quem estiver aqui, a diretoria inteira vê.</span>
          <div className="mp-degraus">{top3.map(degrau)}</div>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: -6 }}>
          {resto.map((x) => (
            <div key={x.id} className={`mp-lin${x.eu ? " eu" : ""}${p.ameaca && primeiro(p.ameaca.nome) === primeiro(x.nome) && !x.eu ? " ameaca" : ""}`}>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}><b style={{ fontSize: 18, color: "#9FB0C3", width: 18 }}>{x.pos}</b>
                <b>{x.eu ? `Você · ${primeiro(x.nome)}` : x.nome}</b>{movimento(x, 0) && <span className={`mp-m ${movimento(x, 0)!.c}`} style={{ fontWeight: 700 }}>{movimento(x, 0)!.t}</span>}</span>
              <b>{x.pontos} pts</b>
            </div>))}
          {!p.no_podio && (
            <div className="mp-vaga">
              <b>Seu nome cabe aqui.</b>
              {p.top10
                ? <span>Você já está entre os 10 primeiros da empresa! Faltam <b>{pts(faltaPodio)}</b> para o pódio: <b>{emAcoes(faltaPodio)}</b>.</span>
                : <span>Faltam <b>{pts(p.falta_top10 || 1)}</b> para você entrar no top 10 da empresa: <b>{emAcoes(p.falta_top10 || 1)}</b>.</span>}
              {p.podio[0]?.hoje > 0 && <span className="mp-m" style={{ color: "#C9D4E2" }}>Hoje {primeiro(p.podio[0].nome)} já fez {pts(p.podio[0].hoje)}.</span>}
            </div>)}
        </div>
      </>}

      {p.no_podio && p.ameaca && (
        <div className="mp-alerta ruim">
          <span className="mp-cap mp-verm">Cuidado</span>
          <b>{primeiro(p.ameaca.nome)} está chegando{p.ameaca.visitas_marcadas || p.ameaca.docs_semana ? " e pode te passar nos próximos dias" : ""}.</b>
          <span style={{ color: "#F2D3CC" }}>{p.ameaca.diff === 0 ? "Vocês estão empatados" : `Está a ${pts(p.ameaca.diff)} de você`}
            {p.ameaca.visitas_marcadas ? `, tem ${p.ameaca.visitas_marcadas} visita${p.ameaca.visitas_marcadas > 1 ? "s" : ""} marcada${p.ameaca.visitas_marcadas > 1 ? "s" : ""}` : ""}
            {p.ameaca.docs_semana ? ` e recebeu documentos de ${p.ameaca.docs_semana} cliente${p.ameaca.docs_semana > 1 ? "s" : ""} esta semana` : ""}.</span>
        </div>)}
      {p.no_podio && (
        <div className="mp-alerta bom">
          <span className="mp-cap mp-verde">Para segurar e subir</span>
          {p.acima ? <b>{p.acima.diff === 0 ? `Você está empatado com ${primeiro(p.acima.nome)}: 1 visita e você passa.` : `${primeiro(p.acima.nome)} está à sua frente por pouco: ${emAcoes(p.acima.diff + 1)} e você passa.`}</b>
            : <b>Você é o 1º! Cada visita aumenta a distância para o 2º.</b>}
          {p.pasta && <span style={{ color: "#CDE9E3" }}>Complete a pasta {p.pasta.nome ? `de ${primeiro(p.pasta.nome)}` : ""}{p.pasta.falta ? ` (falta ${p.pasta.falta})` : ""}: vale 3 pontos.</span>}
        </div>)}

      <div className="mp-din">
        <span className="mp-cap" style={{ color: "#8FE3D4" }}>Sua comissão</span>
        {eu.vendas > 0 && <span>✅ {eu.vendas} venda{eu.vendas > 1 ? "s" : ""} no mês: {faixa(c, eu.vendas)}</span>}
        {c.possiveis > 0
          ? <><strong>{faixa(c, c.possiveis)}</strong><span style={{ color: "#CDE9E3" }}>É a chance de {c.possiveis} venda{c.possiveis > 1 ? "s" : ""} com suas {eu.visitas} visitas e {eu.docs} pastas. Para a próxima, faltam <b>{c.falta_visitas} visita{c.falta_visitas > 1 ? "s" : ""}</b>.</span></>
          : <><strong>{faixa(c, 1)}</strong><span style={{ color: "#CDE9E3" }}>É o que vale a sua 1ª venda do mês. Faltam <b>{c.falta_visitas} visita{c.falta_visitas > 1 ? "s" : ""}</b> (ou 3 pastas) para ter chance dela.</span></>}
      </div>

      {(p.quentes > 0 || p.parados > 0 || p.pasta) && (
        <div style={{ display: "grid", gap: 10 }}>
          <span className="mp-cap" style={{ color: "#9FB0C3" }}>Faça hoje</span>
          {p.quentes > 0 && <button type="button" className="mp-acao" onClick={() => onFiltro("quentes")}>
            <span style={{ display: "grid", gap: 2 }}><b>Chame {p.quentes} cliente{p.quentes > 1 ? "s" : ""} quente{p.quentes > 1 ? "s" : ""}</b><span className="mp-m">responderam e esperam você</span></span><span>Chamar</span></button>}
          {p.parados > 0 && <button type="button" className="mp-acao" onClick={() => onFiltro("parados")}>
            <span style={{ display: "grid", gap: 2 }}><b>Retome {p.parados} parado{p.parados > 1 ? "s" : ""}</b><span className="mp-m">sem contato há 3 dias ou mais</span></span><span>Ver</span></button>}
          {p.pasta && <button type="button" className="mp-acao" onClick={() => onAbrir(p.pasta!.lead_id)}>
            <span style={{ display: "grid", gap: 2 }}><b>Complete a pasta {p.pasta.nome ? `de ${primeiro(p.pasta.nome)}` : ""}</b><span className="mp-m">{p.pasta.falta ? `falta ${p.pasta.falta} · ` : ""}vale 3 pontos</span></span><span>Abrir</span></button>}
        </div>)}

      <details className="mp-num">
        <summary>Ver meus números</summary>
        <div className="mp-grade">
          <span><b>{eu.pontos}</b><span className="mp-m">pontos no mês</span></span>
          <span><b>{eu.visitas}</b><span className="mp-m">visitas no mês</span></span>
          <span><b>{eu.docs}</b><span className="mp-m">pastas com documentos</span></span>
          <span><b>{eu.vendas}</b><span className="mp-m">vendas no mês</span></span>
        </div>
        {numeros}
        <p className="mp-m" style={{ marginBottom: 0 }}>Pontos: visita 1 · pasta com documentos 3 · venda 10.</p>
      </details>
    </div>
  );
}

/** A linha do Meu Placar no Hoje (no lugar do cartão grande da meta). */
export function PlacarFaixa({ uid, onAbrir }: { uid: string; onAbrir: () => void }) {
  const { data: p } = usePlacar(uid);
  if (!p?.ok) return null;
  const txt = p.no_podio && p.pos ? `${p.pos}º no pódio da diretoria` : p.top10 ? "no top 10 da empresa" : `faltam ${p.falta_top10} pts para o top 10`;
  const prog = Math.min(100, Math.round(100 * ((p.eu.docs / 3 + p.eu.visitas / 5) % 1)));
  return (
    <button type="button" onClick={onAbrir} aria-label="Abrir Meu Placar"
      style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%", background: "#16263B", border: "1px solid #2A4468", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 8, color: "#EAF0F7", fontFamily: "Inter, system-ui, sans-serif" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 14 }}>
        <span>🏆 <b>Meu Placar</b> · {p.eu.pontos} pts · <b style={{ color: "#F5C451" }}>{txt}</b></span><span style={{ color: "#5FD3BF", fontWeight: 800 }}>›</span>
      </span>
      <span style={{ height: 6, borderRadius: 3, background: "#26405E", display: "block" }}><span style={{ display: "block", width: `${prog}%`, height: 6, borderRadius: 3, background: "#2BB5A0" }} /></span>
    </button>
  );
}
