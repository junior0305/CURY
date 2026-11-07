// Quem está no plantão agora (06/11): check-in, conferências 9h30/16h e situação de cada corretor da estrutura.
// "Não está aqui" tira da roleta na hora; "Confirmar que está" põe de volta (celular falhou). Fica registrado quem marcou.
// Gerente no Time; super e diretor veem as equipes abaixo (escopo_tela).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { distTxt, horaTxt, confTxt, erroTxt, type ConfDia } from "@/lib/plantao";

type Linha = {
  id: string; nome: string; gerente: string | null; roleta: boolean; fonte: string | null; coordenada_igual: boolean;
  s: { situacao: string; plantao: { nome: string; status: string } | null; checkin_em: string | null; checkin_dist_m: number | null; fim_da_roleta: string | null;
       visita_desde: string | null; conferencia_pendente: { qual: string; ate: string } | null; c930: ConfDia; c16: ConfDia };
};
const SIT: Record<string, [string, string]> = {
  roleta: ["Na roleta", "plt-ok"], visita: ["Em visita", "plt-azul"], fora: ["Fora da roleta", "plt-ruim"], aguardando: ["Aguardando liberar", "plt-amarelo"],
  saiu: ["Saiu", "plt-neutro"], sem_checkin: ["Sem check-in hoje", "plt-ruim"],
};
const CSS = `
.plt{display:grid;gap:16px}
.plt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.plt-kpi{border:1px solid rgba(127,140,160,.35);border-radius:12px;padding:12px 14px;display:grid;gap:2px}
.plt-kpi b{font-size:26px}
.plt-kpi span,.plt-m{font-size:13px;opacity:.8}
.plt-alerta{border:1px solid #E8B65C;background:rgba(232,182,92,.14);border-radius:12px;padding:10px 14px;font-size:14px}
.plt-tab{overflow-x:auto;border:1px solid rgba(127,140,160,.35);border-radius:12px}
.plt-tab table{width:100%;min-width:760px;border-collapse:collapse;font-size:14px}
.plt-tab th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;opacity:.75;padding:10px 12px}
.plt-tab td{padding:10px 12px;border-top:1px solid rgba(127,140,160,.2)}
.plt-sit{display:inline-block;border-radius:999px;padding:3px 10px;font-weight:700;font-size:12.5px}
.plt-ok{background:#DDF3EE;color:#075C50}.plt-amarelo{background:#FFF0D1;color:#7A4A00}.plt-ruim{background:#FBE3DD;color:#8E2F1C}.plt-azul{background:#E4ECF7;color:#1F3A5C}.plt-neutro{background:#ECEFF3;color:#3D4A5C}
.plt-btn{border:1px solid rgba(127,140,160,.45);background:transparent;color:inherit;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;cursor:pointer;min-height:36px}
.plt-btn:disabled{opacity:.5;cursor:default}
.plt-btn.no{color:#C2412B;border-color:#E9A796}.plt-btn.sim{color:#0B7A6A;border-color:#8FD3C4}
`;

export default function PlantaoAgora({ como }: { como?: string | null }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);   // super/diretor veem dezenas de corretores: abre só em quem tem check-in ou pendência
  const { data: linhas = [], isLoading, error } = useQuery<Linha[]>({
    queryKey: ["plantaoAgora", como || "eu"], refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_agora", { p_como: como || null }); if (error) throw error; return data || []; },
  });
  const marcar = async (l: Linha, acao: "nao_esta" | "confirma" | "normal") => {
    setOcupado(l.id);
    try {
      const { error } = await (supabase as any).rpc("plantao_gerente_marcar", { p_broker: l.id, p_acao: acao });
      if (error) throw error;
      toast.success(acao === "nao_esta" ? `${l.nome} saiu da roleta` : acao === "normal" ? `${l.nome} está na posição normal da roleta` : `${l.nome} entrou no fim da roleta`);
      qc.invalidateQueries({ queryKey: ["plantaoAgora"] });
    } catch (e) { toast.error(erroTxt(e)); } finally { setOcupado(null); }
  };

  if (isLoading) return <p className="plt-m">Carregando o plantão…</p>;
  if (error) return <p className="plt-m">Não consegui carregar o plantão: {erroTxt(error)}</p>;
  const comCheckin = linhas.filter((l) => l.s.situacao !== "sem_checkin");
  const n = (k: string) => linhas.filter((l) => l.s.situacao === k).length;
  const suspeitos = linhas.filter((l) => l.coordenada_igual);
  const varias = new Set(linhas.map((l) => l.gerente)).size > 1;
  const ordem: Record<string, number> = { aguardando: 0, fora: 1, sem_checkin: 2, roleta: 3, visita: 4, saiu: 5 };
  const filtra = linhas.length > 25 && !todos;
  const lista = [...linhas].filter((l) => !filtra || l.s.situacao !== "sem_checkin" || l.coordenada_igual)
    .sort((a, b) => (ordem[a.s.situacao] ?? 9) - (ordem[b.s.situacao] ?? 9) || (a.gerente || "").localeCompare(b.gerente || "") || a.nome.localeCompare(b.nome));
  // resumo por equipe (super e diretor)
  const porEquipe = varias ? [...new Set(linhas.map((l) => l.gerente || "—"))].sort().map((g) => {
    const ls = linhas.filter((l) => (l.gerente || "—") === g);
    return { g, total: ls.length, roleta: ls.filter((l) => l.s.situacao === "roleta" || l.s.situacao === "visita").length,
             agu: ls.filter((l) => l.s.situacao === "aguardando").length, fora: ls.filter((l) => l.s.situacao === "fora").length };
  }).sort((a, b) => b.roleta - a.roleta || a.g.localeCompare(b.g)) : [];

  return (
    <div className="plt">
      <style>{CSS}</style>
      <div className="plt-kpis">
        <div className="plt-kpi"><b style={{ color: "#0B9A84" }}>{n("roleta")}</b><span>na roleta pelo check-in</span></div>
        <div className="plt-kpi"><b>{n("visita")}</b><span>em visita com cliente</span></div>
        <div className="plt-kpi"><b style={{ color: "#C2412B" }}>{n("fora")}</b><span>fora da roleta (conferência)</span></div>
        <div className="plt-kpi"><b>{n("sem_checkin")}</b><span>sem check-in hoje</span></div>
        {n("aguardando") > 0 && <div className="plt-kpi" style={{ borderColor: "#E8B65C" }}><b style={{ color: "#9A6206" }}>{n("aguardando")}</b><span>esperando você liberar</span></div>}
      </div>
      {suspeitos.map((l) => (
        <div key={l.id} className="plt-alerta"><b>{l.nome}:</b> os últimos registros de localização tiveram a mesma coordenada exata, sem diferença de 1 metro. Pode ser localização falsa: confira se está no plantão.</div>))}
      {comCheckin.length === 0 && <p className="plt-m">Ninguém fez check-in hoje ainda. O corretor faz pelo painel dele (Hoje › Plantão de hoje).</p>}
      {porEquipe.length > 0 && (
        <div className="plt-kpis">
          {porEquipe.map((e) => (
            <div key={e.g} className="plt-kpi"><span style={{ fontWeight: 700, opacity: 1 }}>Equipe {e.g}</span>
              <span><b style={{ fontSize: 18, color: "#0B9A84" }}>{e.roleta}</b> de {e.total} no plantão{e.agu ? ` · ${e.agu} esperando liberar` : ""}{e.fora ? ` · ${e.fora} fora` : ""}</span></div>))}
        </div>)}
      {linhas.length > 25 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="plt-m">{filtra ? `Mostrando ${lista.length} com check-in ou pendência, de ${linhas.length} corretores.` : `Mostrando todos os ${linhas.length} corretores.`}</span>
          <button type="button" className="plt-btn" onClick={() => setTodos(!todos)}>{filtra ? "Ver todos" : "Só quem fez check-in"}</button>
        </div>)}
      <div className="plt-tab">
        <table>
          <thead><tr><th>Corretor</th>{varias && <th>Equipe</th>}<th>Plantão</th><th>Check-in</th><th>9h30</th><th>16h</th><th>Situação</th><th><span style={{ position: "absolute", left: -9999 }}>Ação</span></th></tr></thead>
          <tbody>
            {lista.map((l) => {
              const [rot, cls] = SIT[l.s.situacao] || [l.s.situacao, "plt-neutro"];
              const pend = l.s.conferencia_pendente;
              return (
                <tr key={l.id}>
                  <td><b>{l.nome}</b></td>
                  {varias && <td>{l.gerente || "—"}</td>}
                  <td>{l.s.plantao?.nome || "—"}{l.s.plantao?.status === "pendente" ? " (novo)" : ""}</td>
                  <td>{l.s.checkin_em ? `${horaTxt(l.s.checkin_em)} · ${distTxt(l.s.checkin_dist_m)}` : "—"}</td>
                  <td>{confTxt(l.s.c930)}</td>
                  <td>{confTxt(l.s.c16)}</td>
                  <td><span className={`plt-sit ${cls}`}>{rot}</span>{pend ? <div className="plt-m">conferência {pend.qual} aberta</div> : null}
                    {l.s.situacao === "visita" ? <div className="plt-m">desde {horaTxt(l.s.visita_desde)}</div> : null}
                    {l.roleta && l.s.fim_da_roleta ? <div className="plt-m">no fim da roleta desde {horaTxt(l.s.fim_da_roleta)}</div> : null}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {l.s.situacao === "aguardando" && <button type="button" className="plt-btn sim" disabled={ocupado === l.id} onClick={() => marcar(l, "confirma")}>Liberar</button>}
                    {l.roleta && l.s.fim_da_roleta && <button type="button" className="plt-btn" disabled={ocupado === l.id} onClick={() => marcar(l, "normal")}>Entra normal</button>}
                    {l.roleta || l.s.situacao === "aguardando"
                      ? <button type="button" className="plt-btn no" disabled={ocupado === l.id} onClick={() => marcar(l, "nao_esta")}>{l.roleta ? "Não está aqui" : "Não recebe hoje"}</button>
                      : <button type="button" className="plt-btn sim" disabled={ocupado === l.id} onClick={() => marcar(l, "confirma")}>Confirmar que está</button>}
                    </span>
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      <span className="plt-m">Todo check-in entra no fim da roleta: recebe depois de quem já estava no plantão. "Entra normal" volta o corretor à posição de sempre; "Liberar" e "Confirmar que está" põem na roleta pelo fim; "Não está aqui" tira na hora. Tudo fica registrado com o seu nome. Conferências às 9h30 e às 16h, com 15 minutos para responder.</span>
    </div>
  );
}
