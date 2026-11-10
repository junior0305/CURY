// Desligar gerente (10/11, Junior; 1º uso: Dani na planoego). Super ou diretor decide, nada é automático:
// 1) quem sai junto com o gerente; 2) para que equipe vai cada corretor que fica (leva os leads dele);
// 3) quem assume páginas, formulários, filas, listas, contas de anúncio e números do gerente;
// 4) acesso do gerente (e de quem sai junto) cortado na hora, inclusive sessões abertas no celular e no computador.
// A carteira de quem saiu junto fica em "Saíram e ainda têm carteira" para o líder dividir, baixar ou disparar.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Pessoa = { id: string; nome: string; carteira?: number; corretores?: number };
type Previa = {
  gerente: Pessoa; super: Pessoa | null; corretores: Pessoa[]; destinos: Pessoa[];
  coisas: { paginas: { id: string; nome: string }[]; formularios: number; contas_anuncio: { id: string; nome: string | null }[];
    filas: number; listas: number; numeros_whatsapp: number; plantoes: number; candidatos: number; leads_sem_corretor: number };
};
const sb = supabase as any;

export default function DesligarGerente({ gerenteId, onFechar, onPronto }: { gerenteId: string; onFechar: () => void; onPronto: () => void }) {
  const { data: pv, error, isLoading } = useQuery({
    queryKey: ["desligar-gerente", gerenteId],
    queryFn: async () => {
      const { data, error } = await sb.rpc("desligar_gerente_previa", { p_gerente: gerenteId });
      if (error) throw error;
      return data as Previa;
    },
  });
  const [saem, setSaem] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [todos, setTodos] = useState("");
  const [resp, setResp] = useState("");
  const [indo, setIndo] = useState(false);

  const ficam = useMemo(() => (pv?.corretores ?? []).filter((c) => !saem.has(c.id)), [pv, saem]);
  const espalhou = new Set(ficam.map((c) => destino[c.id]).filter(Boolean)).size > 1;
  // responsável sugerido: a super (os leads das páginas dele podem circular por todas as equipes dela);
  // se todos vão para a mesma equipe, o gerente que recebe
  const respSugerido = espalhou || !ficam.length ? (pv?.super?.id ?? "") : (destino[ficam[0]?.id] || pv?.super?.id || "");
  const respFinal = resp || respSugerido;
  const faltaDestino = ficam.filter((c) => !destino[c.id]);

  const alternaSai = (id: string) => setSaem((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todosPara = (id: string) => { setTodos(id); if (id) setDestino(Object.fromEntries(ficam.map((c) => [c.id, id]))); };

  async function confirmar() {
    if (!pv) return;
    if (faltaDestino.length) { toast.error(`Escolha a equipe de ${faltaDestino.map((c) => c.nome.split(" ")[0]).join(", ")}.`); return; }
    if (!respFinal) { toast.error("Escolha quem assume as páginas e filas do gerente."); return; }
    setIndo(true);
    const { data, error } = await sb.rpc("desligar_gerente", {
      p_gerente: pv.gerente.id, p_saem: [...saem], p_responsavel: respFinal,
      p_destinos: Object.fromEntries(ficam.map((c) => [c.id, destino[c.id]])),
    });
    setIndo(false);
    if (error) { toast.error(error.message || "Não consegui desligar."); return; }
    toast.success(`${pv.gerente.nome} desligado. ${data.ficaram} corretor(es) mudaram de equipe com os leads`
      + (data.sairam ? ` · ${data.sairam} saíram junto (${data.carteira_pendente} leads esperando você em "Saíram e ainda têm carteira")` : "") + ".");
    onPronto();
  }

  const c = pv?.coisas;
  const sel: React.CSSProperties = { font: "inherit", fontSize: 13.5, minHeight: 36, borderRadius: 8, border: "1px solid var(--hair)", padding: "0 8px", background: "transparent", color: "inherit" };

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="dg-t" style={{ maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }}>
        {isLoading ? <p>Montando a prévia…</p> : error || !pv ? (
          <><h3 id="dg-t">Desligar gerente</h3><p style={{ color: "var(--red)" }}>{(error as any)?.message ?? "Não consegui abrir."}</p>
            <div className="tm-modala"><button className="mini" onClick={onFechar}>Fechar</button></div></>
        ) : (
          <>
            <h3 id="dg-t">Desligar {pv.gerente.nome}</h3>
            <p>O acesso dele é cortado na hora, inclusive no celular e no computador que estiverem abertos. O histórico e as vendas continuam no nome dele.</p>

            <div style={{ borderTop: "1px solid var(--hair)", padding: "12px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>1. Corretores da equipe ({pv.corretores.length})</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>Marque quem saiu junto. Quem fica vai para outra equipe e leva os leads dele.</div>
              {ficam.length > 1 && pv.destinos.length ? (
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13.5 }}>Todos os que ficam para:
                  <select style={sel} value={todos} onChange={(e) => todosPara(e.target.value)} aria-label="Equipe para todos">
                    <option value="">escolher…</option>
                    {pv.destinos.map((d) => <option key={d.id} value={d.id}>Equipe {d.nome} ({d.corretores})</option>)}
                  </select>
                </label>
              ) : null}
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {pv.corretores.map((b) => {
                  const sai = saem.has(b.id);
                  return (
                    <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 8px", borderRadius: 8, background: sai ? "rgba(194,65,43,.08)" : "transparent" }}>
                      <b style={{ minWidth: 140 }}>{b.nome}</b>
                      <span style={{ fontSize: 12.5, color: "var(--ink-3)", minWidth: 80 }}>{b.carteira} leads</span>
                      {sai ? <span style={{ fontSize: 13, color: "var(--red)", fontWeight: 700 }}>sai junto</span> : (
                        <select style={sel} value={destino[b.id] ?? ""} aria-label={`Equipe de ${b.nome}`}
                          onChange={(e) => setDestino((d) => ({ ...d, [b.id]: e.target.value }))}>
                          <option value="">vai para…</option>
                          {pv.destinos.map((d) => <option key={d.id} value={d.id}>Equipe {d.nome}</option>)}
                        </select>
                      )}
                      <button type="button" className={`mini${sai ? " solid" : ""}`} onClick={() => alternaSai(b.id)} style={{ marginLeft: "auto" }}>
                        {sai ? "Desfazer" : "Saiu junto"}</button>
                    </div>
                  );
                })}
                {!pv.corretores.length ? <i style={{ fontSize: 13 }}>A equipe não tem corretores ativos.</i> : null}
                {!pv.destinos.length && ficam.length ? <p className="tm-aviso">Não há outro gerente na estrutura para receber os corretores. Cadastre um gerente antes ou marque quem saiu junto.</p> : null}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--hair)", padding: "12px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>2. Quem assume o que era do gerente</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
                {[c?.paginas.length ? `${c.paginas.length} página(s) do Facebook` : null, c?.formularios ? `${c.formularios} formulário(s)` : null,
                  c?.contas_anuncio.length ? `${c.contas_anuncio.length} conta(s) de anúncio` : null, c?.filas ? `${c.filas} fila(s)` : null,
                  c?.listas ? `${c.listas} lista(s) de contatos` : null, c?.numeros_whatsapp ? `${c.numeros_whatsapp} número(s) de WhatsApp` : null,
                  c?.plantoes ? `${c.plantoes} plantão(ões)` : null, c?.candidatos ? `${c.candidatos} candidato(s) em entrevista` : null,
                  c?.leads_sem_corretor ? `${c.leads_sem_corretor} lead(s) sem corretor` : null].filter(Boolean).join(" · ") || "Nada no nome dele."}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13.5 }}>Passa para:
                <select style={sel} value={respFinal} onChange={(e) => setResp(e.target.value)} aria-label="Quem assume">
                  {pv.super ? <option value={pv.super.id}>{pv.super.nome} (superintendente)</option> : null}
                  {pv.destinos.map((d) => <option key={d.id} value={d.id}>{d.nome} (gerente)</option>)}
                </select>
              </label>
              {espalhou && respFinal !== pv.super?.id ? (
                <p className="tm-aviso">Os corretores foram para equipes diferentes: com a página no nome de um gerente só, os leads dela não podem ser passados para as outras equipes. Deixe com a superintendente.</p>
              ) : null}
              {c?.paginas.length || c?.contas_anuncio.length ? (
                <p className="tm-aviso">
                  Atenção: {[...(c.paginas ?? []).map((p) => `página "${p.nome}"`), ...(c.contas_anuncio ?? []).map((a) => `conta "${a.nome ?? a.id}"`)].join(", ")}.
                  Se estiverem no Facebook pessoal ou no Gerenciador de Negócios de {pv.gerente.nome.split(" ")[0]}, ele pode desligar a qualquer momento e os leads param de chegar,
                  mesmo passando para outra pessoa aqui. Combine com ele ou ligue uma página da superintendência em Configurar › Facebook e leads.
                </p>
              ) : null}
            </div>

            {saem.size ? (
              <p style={{ fontSize: 13.5 }}>
                <b>{saem.size} saem junto</b> ({(pv.corretores.filter((b) => saem.has(b.id)).reduce((a, b) => a + (b.carteira ?? 0), 0))} leads): perdem o acesso agora.
                A carteira deles fica esperando você em <b>"Saíram e ainda têm carteira"</b>, logo abaixo da equipe, para dividir, baixar a lista ou disparar.
              </p>
            ) : null}

            <div className="tm-modala">
              <button className="mini" onClick={onFechar}>Cancelar</button>
              <button className="mini solid" disabled={indo || !!faltaDestino.length} onClick={confirmar}
                style={{ background: "var(--red)", borderColor: "var(--red)" }}>
                {indo ? "desligando…" : faltaDestino.length ? `Falta escolher a equipe de ${faltaDestino.length}` : `Desligar ${pv.gerente.nome.split(" ")[0]}`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
