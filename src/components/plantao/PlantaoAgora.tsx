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
  s: { situacao: string; plantao: { nome: string; status: string } | null; checkin_em: string | null; checkin_dist_m: number | null;
       visita_desde: string | null; conferencia_pendente: { qual: string; ate: string } | null; c930: ConfDia; c16: ConfDia };
};
const SIT: Record<string, [string, string]> = {
  roleta: ["Na roleta", "plt-ok"], visita: ["Em visita", "plt-azul"], fora: ["Fora da roleta", "plt-ruim"],
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
.plt-ok{background:#DDF3EE;color:#075C50}.plt-ruim{background:#FBE3DD;color:#8E2F1C}.plt-azul{background:#E4ECF7;color:#1F3A5C}.plt-neutro{background:#ECEFF3;color:#3D4A5C}
.plt-btn{border:1px solid rgba(127,140,160,.45);background:transparent;color:inherit;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;cursor:pointer;min-height:36px}
.plt-btn:disabled{opacity:.5;cursor:default}
.plt-btn.no{color:#C2412B;border-color:#E9A796}.plt-btn.sim{color:#0B7A6A;border-color:#8FD3C4}
`;

export default function PlantaoAgora({ como }: { como?: string | null }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { data: linhas = [], isLoading, error } = useQuery<Linha[]>({
    queryKey: ["plantaoAgora", como || "eu"], refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_agora", { p_como: como || null }); if (error) throw error; return data || []; },
  });
  const marcar = async (l: Linha, acao: "nao_esta" | "confirma") => {
    setOcupado(l.id);
    try {
      const { error } = await (supabase as any).rpc("plantao_gerente_marcar", { p_broker: l.id, p_acao: acao });
      if (error) throw error;
      toast.success(acao === "nao_esta" ? `${l.nome} saiu da roleta` : `${l.nome} voltou para a roleta`);
      qc.invalidateQueries({ queryKey: ["plantaoAgora"] });
    } catch (e) { toast.error(erroTxt(e)); } finally { setOcupado(null); }
  };

  if (isLoading) return <p className="plt-m">Carregando o plantão…</p>;
  if (error) return <p className="plt-m">Não consegui carregar o plantão: {erroTxt(error)}</p>;
  const comCheckin = linhas.filter((l) => l.s.situacao !== "sem_checkin");
  const n = (k: string) => linhas.filter((l) => l.s.situacao === k).length;
  const suspeitos = linhas.filter((l) => l.coordenada_igual);
  const varias = new Set(linhas.map((l) => l.gerente)).size > 1;
  const ordem: Record<string, number> = { fora: 0, sem_checkin: 1, roleta: 2, visita: 3, saiu: 4 };
  const lista = [...linhas].sort((a, b) => (ordem[a.s.situacao] ?? 9) - (ordem[b.s.situacao] ?? 9) || a.nome.localeCompare(b.nome));

  return (
    <div className="plt">
      <style>{CSS}</style>
      <div className="plt-kpis">
        <div className="plt-kpi"><b style={{ color: "#0B9A84" }}>{n("roleta")}</b><span>na roleta pelo check-in</span></div>
        <div className="plt-kpi"><b>{n("visita")}</b><span>em visita com cliente</span></div>
        <div className="plt-kpi"><b style={{ color: "#C2412B" }}>{n("fora")}</b><span>fora da roleta (conferência)</span></div>
        <div className="plt-kpi"><b>{n("sem_checkin")}</b><span>sem check-in hoje</span></div>
      </div>
      {suspeitos.map((l) => (
        <div key={l.id} className="plt-alerta"><b>{l.nome}:</b> os últimos registros de localização tiveram a mesma coordenada exata, sem diferença de 1 metro. Pode ser localização falsa: confira se está no plantão.</div>))}
      {comCheckin.length === 0 && <p className="plt-m">Ninguém fez check-in hoje ainda. O corretor faz pelo painel dele (Hoje › Plantão de hoje).</p>}
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
                    {l.s.situacao === "visita" ? <div className="plt-m">desde {horaTxt(l.s.visita_desde)}</div> : null}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.roleta
                      ? <button type="button" className="plt-btn no" disabled={ocupado === l.id} onClick={() => marcar(l, "nao_esta")}>Não está aqui</button>
                      : <button type="button" className="plt-btn sim" disabled={ocupado === l.id} onClick={() => marcar(l, "confirma")}>Confirmar que está</button>}
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      <span className="plt-m">"Não está aqui" tira da roleta na hora e fica registrado com o seu nome. "Confirmar que está" põe de volta, para quando o celular falhou. As conferências são às 9h30 e às 16h, com 15 minutos para responder.</span>
    </div>
  );
}
