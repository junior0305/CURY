// Contas de anúncio: qual conta do Facebook é de quem. Fonte única = fb_bm_tokens, mexida só pela edge fb-contas.
// O diretor vê todas, escolhe o dono de cada uma e liga as contas novas que os tokens enxergam.
// Gerente e super veem as contas da estrutura deles, sem editar. Todas as telas de anúncio leem daqui.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const brl = (n: number | null | undefined) => (n == null ? "—" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
const PAPEL: Record<string, string> = { BROKER: "corretor", MANAGER: "gerente", SUPERINTENDENT: "super", DIRECTOR: "diretor" };
const GRUPOS: [string, string][] = [["DIRECTOR", "Diretoria"], ["SUPERINTENDENT", "Superintendentes"], ["MANAGER", "Gerentes"], ["BROKER", "Corretores"]];
const MOTIVO: Record<string, string> = {
  ninguem: "o nome não bate com ninguém desse papel",
  varios: "o nome bate com mais de uma pessoa",
  sem_papel_ou_nome: "falta o papel ou o nome no nome da conta",
};

// `como` = id da tela que está aberta ("Ver como"): o admin vê só o que aquela pessoa vê.
export default function ContasAnuncio({ como }: { como?: string | null } = {}) {
  const qc = useQueryClient();
  const [verNovas, setVerNovas] = useState(false);
  const [verInativas, setVerInativas] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fb-contas", como ?? ""], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fb-contas", { body: { modo: "listar", como: como ?? null } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      return data as { pode_editar: boolean; contas: any[]; novas: any[]; lideres: { id: string; nome: string; papel: string }[]; prefixo?: string };
    },
  });
  const mudar = async (account_id: string, owner_id: string | null) => {
    setSalvando(account_id);
    const { data: r, error } = await supabase.functions.invoke("fb-contas", { body: { modo: "atribuir", account_id, owner_id } });
    setSalvando(null);
    if (error || (r as any)?.error) { toast.error((r as any)?.error || error?.message || "Não consegui salvar."); return; }
    toast.success(owner_id ? "Conta ligada ao dono. As telas de anúncio já leem assim." : "Conta ficou sem dono.");
    qc.invalidateQueries({ queryKey: ["fb-contas"] });
  };
  const esconder = async (account_id: string, nome: string) => {
    setSalvando(account_id);
    const { data: r, error } = await supabase.functions.invoke("fb-contas", { body: { modo: "esconder", account_id, nome } });
    setSalvando(null);
    if (error || (r as any)?.error) { toast.error((r as any)?.error || error?.message || "Não consegui salvar."); return; }
    toast.success("Conta escondida: não aparece mais aqui.");
    qc.invalidateQueries({ queryKey: ["fb-contas"] });
  };
  const ativar = async (account_id: string, ativa: boolean) => {
    setSalvando(account_id);
    const { data: r, error } = await supabase.functions.invoke("fb-contas", { body: { modo: "ativa", account_id, ativa } });
    setSalvando(null);
    if (error || (r as any)?.error) { toast.error((r as any)?.error || error?.message || "Não consegui salvar."); return; }
    qc.invalidateQueries({ queryKey: ["fb-contas"] });
  };

  if (isLoading) return <div className="cfg-box ca"><p className="cfg-dica">Lendo as contas de anúncio…</p></div>;
  if (!data) return null;
  const ativas = data.contas.filter((c) => c.ativa);
  const inativas = data.contas.filter((c) => !c.ativa);
  const semDono = ativas.filter((c) => !c.dono_id || c.dono_inativo);
  const Opcoes = () => (
    <>{GRUPOS.map(([papel, rot]) => {
      const ls = data.lideres.filter((l) => l.papel === papel);
      return ls.length ? <optgroup key={papel} label={rot}>{ls.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</optgroup> : null;
    })}</>
  );
  const nomeDe = (id: string | null) => data.lideres.find((l) => l.id === id);
  const pre = data.prefixo || "EV";
  const Seletor = ({ c }: { c: any }) => (
    <select value={c.dono_id ?? ""} disabled={salvando === c.account_id} aria-label={`Dono da conta ${c.nome}`}
      onChange={(e) => mudar(c.account_id, e.target.value || null)}>
      <option value="">— sem dono —</option>
      <Opcoes />
    </select>
  );

  return (
    <div className="cfg-box ca">
      <style>{CSS}</style>
      <div className="ca-h">
        <div>
          <h3>Contas de anúncio</h3>
          <p>{data.pode_editar ? "Cada conta do Facebook tem um único dono no Comandra. É daqui que saem os números de Anúncios, Mídia e os alertas do tráfego."
            : "As contas de anúncio ligadas à sua estrutura. Quem muda o dono é o diretor."}</p>
        </div>
        <button className="cfg-btn" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Lendo…" : "Atualizar"}</button>
      </div>
      {data.pode_editar ? (
        <p className="ca-padrao">Para o Comandra ligar a conta sozinho, dê a ela no Facebook um nome no padrão <b className="mono">{pre}-PAPEL-NOME</b>,
          por exemplo <span className="mono">{pre}-GERENTE-ALEX</span>, <span className="mono">{pre}-SUPERINTENDENTE-DANI</span> ou <span className="mono">{pre}-CORRETOR-BRUNA</span>.
          Ele confere de hora em hora. O que o diretor apontar aqui vale mais que o nome.</p>
      ) : null}
      {semDono.length ? <p className="ca-aviso">{semDono.length} conta(s) ativa(s) sem dono: os números dela não aparecem para ninguém.</p> : null}

      <div className="ca-tab">
        <div className="ca-tr ca-th"><span>Conta</span><span>Dono</span><span>Página</span><span>Gasto 7 dias</span><span>Leitura</span>{data.pode_editar ? <span /> : null}</div>
        {ativas.map((c) => (
          <div key={c.account_id} className={`ca-tr ${!c.dono_id || c.dono_inativo ? "sem" : ""}`}>
            <span className="ca-nome"><b>{c.nome}</b><small className="mono">{c.account_id}</small></span>
            <span>{data.pode_editar ? <Seletor c={c} /> : (c.dono ?? "—")}{c.dono_origem === "nome" && !c.dono_inativo ? <em className="grn" title="Ligada pelo nome da conta">pelo nome</em> : null}{c.dono_inativo ? <em className="red">dono desligado</em> : null}</span>
            <span>{c.paginas.length ? c.paginas.join(", ") : <span className="ca-dim">—</span>}</span>
            <span className="mono">{brl(c.gasto_7d)}</span>
            <span>{c.erro ? <em className="red" title={c.erro}>com erro</em> : c.lido_em ? <em className="grn">lendo</em> : <em className="amb">ainda não lida</em>}</span>
            {data.pode_editar ? <span><button className="ca-link" onClick={() => ativar(c.account_id, false)} disabled={salvando === c.account_id}>Desligar</button></span> : null}
          </div>
        ))}
        {!ativas.length ? <p className="cfg-dica ca-pad">Nenhuma conta de anúncio ligada.</p> : null}
      </div>

      {data.pode_editar && data.novas.length ? (
        <div className="ca-sec">
          <button className="ca-link" onClick={() => setVerNovas(!verNovas)}>{verNovas ? "▾" : "▸"} {data.novas.length} conta(s) com o nome {pre}- que ainda não estão ligadas</button>
          {verNovas ? (
            <div className="ca-tab">
              {data.novas.map((n) => (
                <div key={n.account_id} className="ca-tr ca-tr3">
                  <span className="ca-nome"><b>{n.nome}</b><small className="mono">{n.account_id}{n.bm ? ` · ${n.bm}` : ""}</small></span>
                  <span>{n.ativa_no_facebook ? <em className="grn">ativa no Facebook</em> : <em className="amb">inativa no Facebook</em>}
                    {n.sugestao && nomeDe(n.sugestao) ? <small className="ca-sug">pelo nome: {nomeDe(n.sugestao)!.nome} ({PAPEL[nomeDe(n.sugestao)!.papel]})</small>
                      : n.motivo && MOTIVO[n.motivo] ? <small className="ca-sug ca-dim">{MOTIVO[n.motivo]}</small> : null}</span>
                  <span className="ca-acoes">
                    {n.sugestao && nomeDe(n.sugestao)
                      ? <button className="cfg-btn" disabled={salvando === n.account_id} onClick={() => mudar(n.account_id, n.sugestao)}>Ligar a {nomeDe(n.sugestao)!.nome.split(" ")[0]}</button> : null}
                    <select defaultValue="" disabled={salvando === n.account_id} aria-label={`Dono da conta ${n.nome}`} onChange={(e) => e.target.value && mudar(n.account_id, e.target.value)}>
                      <option value="">{n.sugestao ? "Outro dono…" : "Ligar a…"}</option>
                      <Opcoes />
                    </select>
                    <button className="ca-link" disabled={salvando === n.account_id} onClick={() => esconder(n.account_id, n.nome)}>Não é nossa</button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {data.pode_editar && inativas.length ? (
        <div className="ca-sec">
          <button className="ca-link" onClick={() => setVerInativas(!verInativas)}>{verInativas ? "▾" : "▸"} {inativas.length} conta(s) desligada(s)</button>
          {verInativas ? (
            <div className="ca-tab">
              {inativas.map((c) => (
                <div key={c.account_id} className="ca-tr ca-tr3">
                  <span className="ca-nome"><b>{c.nome}</b><small className="mono">{c.account_id}</small></span>
                  <span className="ca-dim">{c.dono ?? "sem dono"}</span>
                  <span><button className="cfg-btn" onClick={() => ativar(c.account_id, true)} disabled={salvando === c.account_id}>Religar</button></span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const CSS = `
.mgr10 .ca{max-width:none;margin-bottom:var(--s3)}
.mgr10 .ca-h{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.mgr10 .ca-aviso{background:var(--amber-air);color:var(--amber);font-weight:600;font-size:13.5px;border-radius:10px;padding:10px 12px;margin:0}
.mgr10 .ca-tab{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.mgr10 .ca-tr{display:grid;grid-template-columns:minmax(0,2fr) minmax(170px,1.4fr) minmax(0,1.2fr) 100px 110px 80px;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--hair);font-size:13.5px}
.mgr10 .ca-tr.ca-tr3{grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(170px,1fr)}
.mgr10 .ca-tr:first-child{border-top:0}
.mgr10 .ca-th{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk)}
.mgr10 .ca-tr.sem{background:var(--amber-air)}
.mgr10 .ca-nome{display:grid;min-width:0}
.mgr10 .ca-nome b{overflow-wrap:anywhere}
.mgr10 .ca-nome small{font-size:11.5px;color:var(--ink-3)}
.mgr10 .ca select{font:inherit;font-size:13px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px;max-width:100%}
.mgr10 .ca em{font-style:normal;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;margin-left:4px}
.mgr10 .ca em.red{color:var(--red);background:var(--red-air)} .mgr10 .ca em.grn{color:var(--good);background:var(--good-air)} .mgr10 .ca em.amb{color:var(--amber);background:var(--amber-air)}
.mgr10 .ca-link{color:var(--blue);font-weight:600;font-size:13px}
.mgr10 .ca-dim{color:var(--ink-3)}
.mgr10 .ca-sec{display:grid;gap:8px}
.mgr10 .ca-pad{padding:12px 14px}
.mgr10 .ca-padrao{font-size:13px;color:var(--ink-2);background:var(--sunk);border-radius:10px;padding:10px 12px;margin:0;line-height:1.5}
.mgr10 .ca-sug{display:block;font-size:12px;color:var(--ink-2);margin-top:4px}
.mgr10 .ca-acoes{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
@media(max-width:800px){.mgr10 .ca-tr{grid-template-columns:minmax(0,1fr) minmax(150px,1fr)}.mgr10 .ca-tr>span:nth-child(n+3){display:none}}
`;
