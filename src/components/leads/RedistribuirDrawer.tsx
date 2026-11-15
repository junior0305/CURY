// Painel lateral de redistribuição (Junior, 15/11): 1 clique, escolhe 1+ corretores, divide igualmente, e SUGERE
// para quem mandar com dado real — quem está no plantão/online e converte bem; quem atende pouco vem com alerta.
import { useMemo, useState } from "react";

export type CorretorRico = {
  id: string; nome: string; carteira: number;
  contato: number | null;   // % dos leads dele que ele tocou
  avanca: number | null;    // % dos tocados que avançaram (visita/negociação/venda)
  online: boolean; plantao: boolean;
};
const ini = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();

export default function RedistribuirDrawer({ n, corretores, indo, onConfirm, onFechar }: {
  n: number; corretores: CorretorRico[]; indo: boolean;
  onConfirm: (ids: string[]) => void; onFechar: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const toggle = (id: string) => setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  // pontuação: disponível + converte bem + não sobrecarregado. Atende pouco penaliza.
  const score = (c: CorretorRico) =>
    (c.plantao ? 3 : c.online ? 2 : 0) + (c.avanca ?? 0) / 25 + (c.contato ?? 0) / 50 - c.carteira / 60;
  const ordenados = useMemo(() => [...corretores].sort((a, b) => score(b) - score(a)), [corretores]);
  const sugeridos = ordenados.filter((c) => (c.plantao || c.online) && (c.avanca ?? 0) >= 20 && (c.contato ?? 0) >= 40).slice(0, 4);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordenados.filter((c) => !q || c.nome.toLowerCase().includes(q));
  }, [ordenados, busca]);

  const porCada = sel.size ? Math.floor(n / sel.size) : 0;
  const Badge = ({ c }: { c: CorretorRico }) => (
    <span className="rd-badges">
      {c.plantao ? <span className="rd-b verde">📍 plantão</span> : c.online ? <span className="rd-b azul">🟢 online</span> : <span className="rd-b cinza">💤 ausente</span>}
      <span className="rd-b"> {c.carteira} na carteira</span>
      {c.contato != null && <span className={`rd-b ${c.contato < 40 ? "alerta" : ""}`}>{c.contato < 40 ? "⚠️ " : ""}contato {c.contato}%</span>}
      {c.avanca != null && c.avanca >= 20 && <span className="rd-b ouro">⭐ converte {c.avanca}%</span>}
    </span>
  );

  return (
    <div className="rd-scrim" onClick={onFechar}>
      <style>{CSS}</style>
      <aside className="rd" onClick={(e) => e.stopPropagation()}>
        <header className="rd-h">
          <div><b>Redistribuir {n} lead{n > 1 ? "s" : ""}</b><small>escolha um ou mais — divide igualmente</small></div>
          <button className="rd-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>

        {sugeridos.length > 0 && (
          <div className="rd-sec">
            <h4>⭐ Recomendados <small>no plantão e convertendo bem</small></h4>
            <div className="rd-sug">
              {sugeridos.map((c) => (
                <button key={c.id} className={`rd-card${sel.has(c.id) ? " on" : ""}`} onClick={() => toggle(c.id)}>
                  <span className="rd-av">{ini(c.nome)}</span>
                  <span className="rd-cn"><b>{c.nome.split(" ")[0]}</b><Badge c={c} /></span>
                  <span className="rd-ck">{sel.has(c.id) ? "✓" : "+"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rd-sec rd-grow">
          <input className="rd-busca" placeholder="🔎  Buscar corretor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="rd-lista">
            {lista.map((c) => (
              <button key={c.id} className={`rd-row${sel.has(c.id) ? " on" : ""}`} onClick={() => toggle(c.id)}>
                <span className="rd-chk">{sel.has(c.id) ? "☑" : "☐"}</span>
                <span className="rd-av sm">{ini(c.nome)}</span>
                <span className="rd-cn"><b>{c.nome}</b><Badge c={c} /></span>
              </button>
            ))}
            {!lista.length && <p className="rd-vazio">Nenhum corretor.</p>}
          </div>
        </div>

        <footer className="rd-f">
          <span className="rd-resumo">{sel.size ? <>{sel.size} corretor(es) · ~<b>{porCada || 1}</b> cada</> : "Marque pelo menos um corretor"}</span>
          <button className="rd-go" disabled={!sel.size || indo} onClick={() => onConfirm([...sel])}>{indo ? "Redistribuindo…" : `Redistribuir ${n}`}</button>
        </footer>
      </aside>
    </div>
  );
}

const CSS = `
.rd-scrim{position:fixed;inset:0;z-index:70;background:rgba(9,12,18,.42);backdrop-filter:blur(3px);display:flex;justify-content:flex-end}
.rd{width:min(440px,96vw);height:100%;background:var(--cv-surface,#fff);display:flex;flex-direction:column;box-shadow:-18px 0 50px rgba(9,12,18,.3);animation:rdin .22s cubic-bezier(.22,.7,.3,1)}
@keyframes rdin{from{transform:translateX(30px);opacity:.4}to{transform:none;opacity:1}}
.rd-h{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--cv-border,#E7EDF6)}
.rd-h b{font-size:17px;font-weight:800;display:block}.rd-h small{font-size:12.5px;color:var(--cv-text-muted,#6B7A90)}
.rd-x{background:none;border:0;font-size:24px;line-height:1;cursor:pointer;color:var(--cv-text-muted,#6B7A90)}
.rd-sec{padding:14px 20px}
.rd-sec h4{margin:0 0 10px;font-size:13px;font-weight:800}.rd-sec h4 small{font-weight:500;color:var(--cv-text-muted,#6B7A90);margin-left:6px}
.rd-sug{display:flex;flex-direction:column;gap:8px}
.mgr10 .rd-card,.mgr10 .rd-row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:1px solid var(--cv-border,#E7EDF6);background:var(--cv-surface,#fff);border-radius:12px;padding:10px 12px;cursor:pointer}
.mgr10 .rd-card.on,.mgr10 .rd-row.on{border-color:#1f63e0;background:rgba(31,99,224,.06)}
.rd-card{border-left:3px solid #E8B84B}
.rd-av{width:36px;height:36px;border-radius:11px;background:#0F1B2D;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;flex:none}
.rd-av.sm{width:30px;height:30px;border-radius:9px;font-size:11px}
.rd-cn{flex:1;min-width:0}.rd-cn b{font-size:14px;font-weight:700;display:block}
.rd-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}
.rd-b{font-size:11px;color:var(--cv-text-muted,#5B6B80);background:var(--cv-sunk,#EEF2F7);border-radius:6px;padding:1px 6px}
.rd-b.verde{color:#0D7C66;background:#DBF3EC}.rd-b.azul{color:#1f63e0;background:#E4EDFB}.rd-b.cinza{color:#8A94A6}
.rd-b.alerta{color:#B4322A;background:#FBE3DD}.rd-b.ouro{color:#9A6B00;background:#FFF2CF}
.rd-ck{font-size:17px;color:#1f63e0;font-weight:800;width:20px;text-align:center}
.rd-grow{flex:1;min-height:0;display:flex;flex-direction:column;border-top:1px solid var(--cv-border,#EEF2F8)}
.rd-busca{min-height:42px;border-radius:10px;border:1px solid var(--cv-border,#DCE3EE);background:var(--cv-surface,#fff);padding:0 12px;font:inherit;font-size:14px;color:inherit;margin-bottom:10px}
.rd-lista{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px}
.rd-chk{font-size:16px;color:#1f63e0;width:18px;flex:none}
.rd-vazio{font-size:13px;color:var(--cv-text-muted,#6B7A90)}
.rd-f{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid var(--cv-border,#E7EDF6);background:var(--cv-sunk,#FAFBFD)}
.rd-resumo{font-size:13px;color:var(--cv-text-muted,#5B6B80)}
.mgr10 .rd-go{min-height:46px;padding:0 20px;border-radius:12px;border:0;background:#1f63e0;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.mgr10 .rd-go:disabled{opacity:.45;cursor:not-allowed}
`;
