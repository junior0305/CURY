import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "@/styles/ativar-pagina.css";

/* "Páginas pra ativar" — aparece SÓ quando há página conectada esperando setup
   (sem fila ou com lead represado). Vazio → não renderiza nada (não bagunça a aba).
   Fonte: RPCs paginas_pra_ativar / corretores_da_pagina / ativar_pagina. */

const sb = supabase as any;
const nome = (e: string) => (e || "").split("@")[0].replace(/^\w/, (c) => c.toUpperCase());

type Pag = { page_id: string; page_name: string; dono_email: string; forms: number; represados: number; tem_fila: boolean; time: number; roleta: number };

export default function PaginasAtivar({ como }: { como?: string | null } = {}) {
  const [lista, setLista] = useState<Pag[]>([]);
  const [modal, setModal] = useState<Pag | null>(null);

  async function carregar() {
    const { data, error } = await sb.rpc("paginas_pra_ativar", { p_como: como ?? null });
    if (error) return; // silencioso: se a RPC não existe ainda, a seção só não aparece
    setLista((data ?? []) as Pag[]);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [como]);

  if (!lista.length) return null;

  return (
    <div className="apg">
      <div className="apg-h">⚡ Páginas pra ativar <span className="b">{lista.length}</span></div>
      <div className="apg-list">
        {lista.map((p) => (
          <div className="apg-row" key={p.page_id}>
            <span className="ic">📄</span>
            <div className="who">
              <b>{p.page_name || p.page_id}</b>
              <div className="chips">
                <span className="c ok">✓ {p.forms} formulários</span>
                {p.represados > 0 ? <span className="c warn">⚠ {p.represados} represados</span> : null}
                {!p.tem_fila ? <span className="c warn">sem fila</span> : <span className="c">na roleta: {p.roleta}/{p.time}</span>}
                {p.dono_email ? <span className="c">{nome(p.dono_email)}</span> : null}
              </div>
            </div>
            <button className="go" onClick={() => setModal(p)}>Ativar</button>
          </div>
        ))}
      </div>
      {modal && <Modal pag={modal} onFechar={() => setModal(null)} onPronto={() => { setModal(null); carregar(); }} />}
    </div>
  );
}

function Modal({ pag, onFechar, onPronto }: { pag: Pag; onFechar: () => void; onPronto: () => void }) {
  const [modo, setModo] = useState<"todos" | "roleta" | "escolher">("roleta");
  const [distribuir, setDistribuir] = useState(true);
  const [corretores, setCorretores] = useState<{ id: string; email: string; na_roleta: boolean }[]>([]);
  const [marc, setMarc] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb.rpc("corretores_da_pagina", { p_page_id: pag.page_id });
      const cs = (data ?? []) as any[];
      setCorretores(cs);
      setMarc(new Set(cs.filter((c) => c.na_roleta).map((c) => c.id))); // começa com a roleta marcada
    })();
  }, [pag.page_id]);

  const qt = modo === "todos" ? pag.time : modo === "roleta" ? pag.roleta : marc.size;
  const alvoNome = modo === "todos" ? `os ${pag.time} corretores do time`
    : modo === "roleta" ? `os ${pag.roleta} da roleta (plantão de hoje)`
      : `os ${marc.size} corretores marcados`;

  async function ativar() {
    if (modo === "escolher" && marc.size === 0) { toast.error("Marque ao menos um corretor."); return; }
    setSalvando(true);
    const { data, error } = await sb.rpc("ativar_pagina", {
      p_page_id: pag.page_id, p_modo: modo,
      p_broker_ids: modo === "escolher" ? [...marc] : null,
      p_distribuir: distribuir,
    });
    setSalvando(false);
    if (error) { toast.error("Não consegui ativar: " + error.message); return; }
    const r = data ?? {};
    toast.success(`Página ativada — vai para ${r.destino ?? qt} corretor(es)${r.represados_distribuidos ? ` · ${r.represados_distribuidos} represados distribuídos` : ""}.`);
    onPronto();
  }

  return (
    <div className="apg-ov" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="apg-card">
        <div className="apg-top">
          <div><h2>Ativar página de anúncio</h2><div className="pg">📄 {pag.page_name} · {nome(pag.dono_email)}</div></div>
          <button className="x" onClick={onFechar}>✕</button>
        </div>
        <div className="apg-st">
          <div className="l"><span className="i ok">✓</span><b>Página conectada</b><span>· acesso a leads liberado</span></div>
          <div className="l"><span className="i ok">✓</span><b>{pag.forms} formulários lidos</b></div>
          {pag.represados > 0 ? <div className="l"><span className="i warn">!</span><b>{pag.represados} leads represados</b><span>· esperando corretor</span></div> : null}
        </div>

        <div className="apg-body">
          <p className="apg-q">Quem recebe os leads desta página?</p>

          <div className={`opt${modo === "todos" ? " on" : ""}`} onClick={() => setModo("todos")}>
            <span className="rd" /><span className="tx"><b>Todos os corretores do time</b><span>rodízio entre o time inteiro, no plantão ou não</span></span><span className="n">{pag.time}</span>
          </div>
          <div className={`opt${modo === "roleta" ? " on" : ""}`} onClick={() => setModo("roleta")}>
            <span className="rd" /><span className="tx"><b>Só quem está na roleta (plantão)</b><span>respeita o plantão — só recebe quem fez check-in hoje. Recomendado.</span></span><span className="n">{pag.roleta}</span>
          </div>
          <div className={`opt${modo === "escolher" ? " on" : ""}`} onClick={() => setModo("escolher")}>
            <span className="rd" /><span className="tx"><b>Escolher os corretores</b><span>você marca quem entra no rodízio desta página</span></span><span className="n">{marc.size || "—"}</span>
          </div>

          {modo === "escolher" && (
            <div className="apg-pick">
              {corretores.map((c) => {
                const on = marc.has(c.id);
                return (
                  <label className={`pk${on ? " on" : ""}`} key={c.id} onClick={(e) => { e.preventDefault(); setMarc((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); }}>
                    <span className="cx">{on ? "✓" : ""}</span>
                    <span className="nm">{nome(c.email)}</span>
                    {c.na_roleta ? <span className="tg">na roleta</span> : null}
                  </label>
                );
              })}
              {!corretores.length ? <div style={{ padding: 10, color: "var(--ink-3)", fontSize: 13 }}>Time sem corretor cadastrado.</div> : null}
            </div>
          )}

          {pag.represados > 0 && (
            <div className="apg-repr">
              <div className="h">📥 E os {pag.represados} leads represados?</div>
              <div className="sub">Já chegaram e estão sem corretor. O que fazer agora?</div>
              <div className="apg-seg">
                <b className={distribuir ? "on" : ""} onClick={() => setDistribuir(true)}>Distribuir agora</b>
                <b className={!distribuir ? "on" : ""} onClick={() => setDistribuir(false)}>Deixar represado</b>
              </div>
            </div>
          )}
        </div>

        <div className="apg-foot">
          <p className="apg-prev">
            Próximos leads → rodízio entre <b>{alvoNome}</b>.
            {pag.represados > 0 ? (distribuir
              ? <> Os <b>{pag.represados} represados</b> vão agora pra esses corretores (≈{Math.max(1, Math.ceil(pag.represados / Math.max(1, qt)))} por um).</>
              : <> Os {pag.represados} represados ficam parados por enquanto.</>) : null}
          </p>
          <button className="apg-act" disabled={salvando || qt === 0} onClick={ativar}>
            {salvando ? "Ativando…" : qt === 0 ? "Escolha quem recebe" : `Ativar página${pag.represados > 0 && distribuir ? ` e distribuir os ${pag.represados}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
