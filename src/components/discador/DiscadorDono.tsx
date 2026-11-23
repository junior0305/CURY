// Área do Dono do Discador (diretor/super/gerente) — vê as linhas que o admin alocou,
// mira quem usa (equipe toda / equipe de um gerente / escolher), acompanha indicadores,
// e configura o rodízio por tempo. Só gerencia o próprio pool; a infra é do admin.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as any;

type Linha = { id: string; ramal: string; ativo: boolean; em_uso: boolean; em_uso_nome: string | null; desde: string | null };
type Membro = { id: string; nome: string; equipe: string; ligacoes: number; atendidas: number; visitas: number };
type Ind = { ligacoes: number; atenderam: number; minutos: number; linhas_total: number; linhas_uso: number; visitas: number };

const hhmm = (iso: string | null) => { if (!iso) return ""; const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); const m = Math.floor(s / 60); return m < 1 ? "agora" : `há ${m}min`; };

export default function DiscadorDono() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["disc-dono"],
    queryFn: async () => { const { data, error } = await sb.rpc("disc_dono_painel"); if (error) throw error; return data as { linhas: Linha[]; pool: Membro[]; ind: Ind; rodizio: { minutos: number | null } }; },
    refetchInterval: 15000,
  });
  const recarrega = () => qc.invalidateQueries({ queryKey: ["disc-dono"] });

  const [busca, setBusca] = useState("");
  const { data: corretores } = useQuery({ queryKey: ["disc-cor"], queryFn: async () => { const { data } = await sb.rpc("disc_dono_corretores"); return (data ?? []) as { id: string; nome: string; gerente_id: string; gerente: string; no_pool: boolean }[]; } });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selInit, setSelInit] = useState(false);
  const tocou = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const [salvando, setSalvando] = useState<"" | "salvando" | "ok">("");
  useEffect(() => { if (corretores && !selInit) { setSel(new Set(corretores.filter((c) => c.no_pool).map((c) => c.id))); setSelInit(true); } }, [corretores, selInit]);

  const ind = data?.ind;
  const temLinha = (data?.linhas ?? []).length > 0;
  const score = (m: Membro) => m.visitas * 10 + m.atendidas * 2 + m.ligacoes;
  const ranking = useMemo(() => (data?.pool ?? []).filter((m) => m.ligacoes > 0 || m.visitas > 0).sort((a, b) => score(b) - score(a)).slice(0, 8), [data]);
  const topScore = ranking.length ? score(ranking[0]) : 1;

  // agrupa por gerente, com filtro de busca
  const grupos = useMemo(() => {
    const m = new Map<string, { gerente: string; cs: { id: string; nome: string }[] }>();
    (corretores ?? []).filter((c) => (c.nome + " " + c.gerente).toLowerCase().includes(busca.toLowerCase()))
      .forEach((c) => { const k = c.gerente_id || "sem"; if (!m.has(k)) m.set(k, { gerente: c.gerente, cs: [] }); m.get(k)!.cs.push({ id: c.id, nome: c.nome }); });
    return [...m.values()];
  }, [corretores, busca]);

  const toggle = (id: string) => { tocou.current = true; setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const marcarGrupo = (cs: { id: string }[], on: boolean) => { tocou.current = true; setSel((s) => { const n = new Set(s); cs.forEach((c) => (on ? n.add(c.id) : n.delete(c.id))); return n; }); };
  function miraEquipe() { tocou.current = true; setSel(new Set((corretores ?? []).map((c) => c.id))); }
  function limpar() { tocou.current = true; setSel(new Set()); }
  async function setRodizio(min: number | null) { const { error } = await sb.rpc("disc_dono_rodizio", { p_minutos: min ?? 0 }); if (error) return toast.error(error.message); recarrega(); }

  // salva a seleção NA HORA (sem botão) — marcar/desmarcar libera igual ao "Equipe toda"
  useEffect(() => {
    if (!tocou.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSalvando("salvando");
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await sb.rpc("disc_dono_pool_set", { p_modo: "escolher", p_gerente: null, p_corretores: [...sel] });
      if (error) { toast.error(error.message); setSalvando(""); return; }
      setSalvando("ok"); qc.invalidateQueries({ queryKey: ["disc-cor"] }); qc.invalidateQueries({ queryKey: ["disc-dono"] });
      window.setTimeout(() => setSalvando(""), 1500);
    }, 700);
  }, [sel]);

  const rod = data?.rodizio?.minutos ?? null;

  return (
    <div className="ddn"><style>{CSS}</style>
      <div className="ddn-h"><b>📞 Discador da equipe</b><span>As linhas que o admin te deu. Você decide quem usa; a infra é do admin.</span></div>

      {!isLoading && !temLinha && <div className="ddn-vazio">Nenhuma linha alocada pra você ainda. Peça ao admin pra alocar um ramal em <b>/admin → Integrações → Discador</b>.</div>}

      {temLinha && <>
        {/* INDICADORES */}
        <div className="ddn-kpis">
          <div className="ddn-kpi ac"><b>{ind?.ligacoes ?? 0}</b><span>ligações hoje</span></div>
          <div className="ddn-kpi good"><b>{ind?.ligacoes ? Math.round((ind.atenderam / ind.ligacoes) * 100) : 0}%</b><span>atenderam</span></div>
          <div className="ddn-kpi"><b>{ind?.minutos ?? 0}<small> min</small></b><span>tempo falado</span></div>
          <div className="ddn-kpi warn"><b>{ind?.linhas_uso ?? 0}<small>/{ind?.linhas_total ?? 0}</small></b><span>linhas em uso</span></div>
          <div className="ddn-kpi good"><b>{ind?.visitas ?? 0}</b><span>visitas marcadas</span></div>
        </div>

        {/* MINHAS LINHAS */}
        <div className="ddn-card">
          <div className="ddn-ch">Minhas linhas (ao vivo)</div>
          {(data?.linhas ?? []).map((l) => (
            <div className="ddn-linha" key={l.id}>
              <span className={`dot ${!l.ativo ? "off" : l.em_uso ? "busy" : "free"}`} />
              <b className="mono">{l.ramal}</b>
              <span className="ddn-lst">{!l.ativo ? "inativa" : l.em_uso ? <>em uso por <b>{l.em_uso_nome}</b> · {hhmm(l.desde)}</> : "livre"}</span>
            </div>
          ))}
        </div>

        {/* QUEM PODE USAR */}
        {/* RANKING DE SUCESSO */}
        <div className="ddn-card">
          <div className="ddn-ch">Ranking de sucesso — hoje <span className="ddn-opt">visita vale mais que ligação</span></div>
          {ranking.length ? ranking.map((m, i) => (
            <div className="ddn-rk" key={m.id}>
              <span className="pos">{i + 1}</span>
              <span className="nm">{m.nome}</span>
              <span className="barw"><span style={{ width: `${Math.max(6, Math.round((score(m) / topScore) * 100))}%` }} /></span>
              <span className="vals"><b>{m.visitas}</b> vis · <b>{m.atendidas}</b> at · {m.ligacoes} lig</span>
            </div>
          )) : <small className="ddn-mut">Ninguém registrou ligação hoje ainda.</small>}
        </div>

        <div className="ddn-card">
          <div className="ddn-ch">Quem pode usar as linhas <span className="ddn-cnt">{sel.size} marcados</span></div>
          <div className="ddn-mira">
            <button className="ddn-b" onClick={miraEquipe}>Equipe toda</button>
            <button className="ddn-b2" onClick={limpar}>Limpar</button>
            <input className="ddn-busca" placeholder="Buscar corretor ou gerente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="ddn-grps">
            {grupos.map((g, i) => {
              const todosOn = g.cs.length > 0 && g.cs.every((c) => sel.has(c.id));
              return (
                <div className="ddn-grp" key={i}>
                  <div className="ddn-grph"><span>{g.gerente} · {g.cs.length}</span><button onClick={() => marcarGrupo(g.cs, !todosOn)}>{todosOn ? "desmarcar equipe" : "marcar equipe"}</button></div>
                  <div className="ddn-cks">
                    {g.cs.map((c) => (
                      <label key={c.id} className={`ddn-ck${sel.has(c.id) ? " on" : ""}`} onClick={(e) => { e.preventDefault(); toggle(c.id); }}><span className="bx" />{c.nome}</label>
                    ))}
                  </div>
                </div>
              );
            })}
            {!grupos.length && <small className="ddn-mut">Nenhum corretor encontrado.</small>}
          </div>
          <div className="ddn-save">{salvando === "salvando" ? <span className="ddn-mut">salvando…</span> : salvando === "ok" ? <span style={{ color: "var(--good)", fontSize: 12.5, fontWeight: 700 }}>✓ liberado na hora</span> : <span className="ddn-mut">Marque ou desmarque — libera na hora, sem botão.</span>}</div>
        </div>

        {/* RODÍZIO */}
        <div className="ddn-card">
          <div className="ddn-ch">Rodízio da linha <span className="ddn-opt">opcional</span></div>
          <div className="ddn-seg">
            <button className={rod == null ? "on" : ""} onClick={() => setRodizio(null)}>Desligado</button>
            <button className={rod === 30 ? "on" : ""} onClick={() => setRodizio(30)}>30 min</button>
            <button className={rod === 60 ? "on" : ""} onClick={() => setRodizio(60)}>1 hora</button>
            <button className={rod === 120 ? "on" : ""} onClick={() => setRodizio(120)}>2 horas</button>
          </div>
          <p className="ddn-note">{rod == null ? "Desligado: quem pega a linha fica até soltar." : `Passa a linha pro colega depois de ${rod} min — só quando alguém está na fila. Sem fila, continua à vontade.`} <b>O corte automático por tempo entra na próxima etapa; por enquanto vale a trava de "linhas ocupadas".</b></p>
        </div>
      </>}
    </div>
  );
}

export function DiscadorGestor() {
  const { mode, toggle } = useTheme();
  useEffect(loadFonts, []);
  return (
    <div className="mgr10 app2">
      <RailV10 atual={"discador" as any} mode={mode} toggle={toggle} />
      <main className="shell2"><div className="sup-wrap"><DiscadorDono /></div></main>
    </div>
  );
}

const CSS = `
.ddn{--sf:#fff;--sf2:#f6f8fb;--ln:#dce3ec;--ln2:#e8edf3;--ink:#0d1f3c;--ink2:#3a4a63;--ink3:#7c8aa0;--ac:#1766d6;--ac-s:#e4efff;--good:#0f9d6b;--good-s:#e2f6ec;--warn:#c77a0a;--warn-s:#fdf0db;--red:#d1443a;--red-s:#fbe6e4;font-family:inherit;color:var(--ink);display:grid;gap:13px;padding-block:8px 24px}
html[data-theme="dark"] .ddn{--sf:#111d33;--sf2:#0e1a2e;--ln:#23344f;--ln2:#1c2c45;--ink:#eaf0fa;--ink2:#aab8cf;--ink3:#6f8099;--ac:#4d93f0;--ac-s:#16294a;--good:#2bc389;--good-s:#123528;--warn:#e0a53f;--warn-s:#3a2d12;--red:#ef6d63;--red-s:#3a1d1b}
.ddn *{box-sizing:border-box}
.ddn-h{display:flex;flex-direction:column;gap:2px}
.ddn-h b{font-size:18px;font-weight:800} .ddn-h span{font-size:12.5px;color:var(--ink2)}
.ddn-vazio{background:var(--warn-s);color:var(--warn);border-radius:12px;padding:14px 16px;font-size:13.5px}
.ddn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.ddn-kpi{border:1px solid var(--ln);border-radius:12px;padding:12px 13px;background:var(--sf)}
.ddn-kpi b{font-size:24px;font-weight:900;display:block;line-height:1} .ddn-kpi b small{font-size:12px;font-weight:700;color:var(--ink3)}
.ddn-kpi span{font-size:11.5px;color:var(--ink2);display:block;margin-top:4px}
.ddn-kpi.ac b{color:var(--ac)} .ddn-kpi.good b{color:var(--good)} .ddn-kpi.warn b{color:var(--warn)}
.ddn-card{background:var(--sf);border:1px solid var(--ln);border-radius:14px;padding:14px 16px}
.ddn-ch{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:800;margin-bottom:11px;flex-wrap:wrap}
.ddn-cnt,.ddn-opt{margin-left:auto;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;background:var(--ac-s);color:var(--ac)} .ddn-opt{background:var(--ln2);color:var(--ink3)}
.ddn-linha{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--ln2);font-size:13.5px}
.ddn-linha:last-child{border-bottom:0}
.dot{width:9px;height:9px;border-radius:50%;flex:none} .dot.free{background:var(--good)} .dot.busy{background:var(--warn)} .dot.off{background:var(--ink3)}
.mono{font-variant-numeric:tabular-nums} .ddn-lst{color:var(--ink2);margin-left:2px}
.ddn-mira{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:11px;align-items:center}
.ddn-b{border:1px solid var(--ac);background:var(--ac-s);color:var(--ac);font:inherit;font-weight:700;font-size:12.5px;padding:8px 13px;border-radius:9px;cursor:pointer}
.ddn-b:disabled{opacity:.5;cursor:default}
.ddn-b2{border:1px solid var(--ln);background:var(--sf);color:var(--ink2);font:inherit;font-weight:700;font-size:12.5px;padding:8px 13px;border-radius:9px;cursor:pointer}
.ddn-busca{flex:1;min-width:150px;border:1px solid var(--ln);border-radius:9px;background:var(--sf);color:var(--ink);font:inherit;font-size:13px;padding:8px 10px}
.ddn-grps{display:grid;gap:9px;max-height:320px;overflow:auto;padding-right:2px}
.ddn-grph{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--ink3);margin:4px 2px 5px}
.ddn-grph button{border:0;background:none;color:var(--ac);font:inherit;font-weight:700;font-size:12px;cursor:pointer}
.ddn-cks{display:flex;flex-wrap:wrap;gap:6px}
.ddn-ck{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ln);border-radius:9px;padding:6px 10px;cursor:pointer;font-size:12.5px;color:var(--ink)}
.ddn-ck.on{border-color:var(--ac);background:var(--ac-s)}
.ddn-ck .bx{width:15px;height:15px;border-radius:4px;border:2px solid var(--ink3);position:relative;flex:none}
.ddn-ck.on .bx{border-color:var(--ac);background:var(--ac)} .ddn-ck.on .bx::after{content:"✓";color:#fff;font-size:10px;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900}
.ddn-save{margin-top:11px}
.ddn-mut{color:var(--ink3);font-size:12.5px}
.ddn-rk{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--ln2);font-size:13px}
.ddn-rk:last-child{border-bottom:0}
.ddn-rk .pos{width:20px;height:20px;border-radius:50%;background:var(--ac-s);color:var(--ac);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
.ddn-rk .nm{width:120px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ddn-rk .barw{flex:1;min-width:60px;height:8px;border-radius:5px;background:var(--ln2);overflow:hidden} .ddn-rk .barw>span{display:block;height:100%;background:var(--good)}
.ddn-rk .vals{font-size:12px;color:var(--ink2);white-space:nowrap} .ddn-rk .vals b{color:var(--ink)}
@media(max-width:560px){.ddn-rk .nm{width:80px}.ddn-rk .vals{font-size:11px}}
.ddn-seg{display:inline-flex;background:var(--sf2);border:1px solid var(--ln);border-radius:10px;padding:3px;gap:3px;flex-wrap:wrap}
.ddn-seg button{border:0;background:transparent;color:var(--ink2);font:inherit;font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:8px;cursor:pointer} .ddn-seg button.on{background:var(--ac);color:#fff}
.ddn-note{font-size:12px;color:var(--ink2);margin:9px 0 0;line-height:1.5}
`;
