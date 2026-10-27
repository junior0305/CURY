/* "Formulários sem dono" (27/10, caso Dani/planoego) — topo da aba Leads do super (e aviso curto no Painel geral).
 *
 * Página de super/diretor sem fila: o lead caía para a árvore toda e ia parar na equipe de outro gerente,
 * ou ficava parado sem dono ("[CILENE]", recrutamento). Aqui a pessoa diz, em 1 passo, de quem é cada
 * formulário: a RPC ligar_formulario cria a fila (que segue a roleta da equipe escolhida — o fila_roleta.py
 * mantém) e entrega na hora os leads que estavam parados. Lista: RPC formularios_sem_dono.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const sb = supabase as any;
type Linha = { form_id: string; page_id: string | null; nome: string; parados: number; leads_14d: number; ultimo: string | null;
  sugestao: string | null; sugestao_nome: string | null; recrutamento: boolean;
  conta: string | null; conta_dono: string | null; pagina_dono: string | null; anuncios: string | null };

const CSS = `.fsd{border:1px solid #fdba74;background:#fff7ed;border-radius:12px;padding:14px 16px;margin-bottom:16px;color:#0f172a}
.fsd h3{margin:0 0 4px;font-size:16px;font-weight:800;color:#9a3412}.fsd p{margin:0 0 10px;font-size:13.5px;color:#7c2d12}
.fsd-i{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;margin-top:8px}
.fsd-n{flex:1;min-width:220px}.fsd-n b{display:block;font-size:14px}.fsd-n i{display:block;font-style:normal;font-size:12.5px;color:#64748b}
.fsd-n .fsd-o{color:#334155;margin-top:2px}.fsd-n a{color:#1d4ed8}
.fsd select{font-size:13.5px;padding:7px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;max-width:260px}
.fsd button{font-size:13.5px;font-weight:700;padding:7px 14px;border-radius:8px;border:1px solid #c2410c;background:#c2410c;color:#fff;cursor:pointer}
.fsd button:disabled{opacity:.5;cursor:default}.fsd-link{background:none!important;border:none!important;color:#9a3412!important;text-decoration:underline;padding:0!important}`;

export default function FormulariosSemDono({ como, compacto, onAbrir }: { como?: string | null; compacto?: boolean; onAbrir?: () => void }) {
  const { session } = useAuth();
  const eu = como || session?.user?.id || null;
  const qc = useQueryClient();
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [ligando, setLigando] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["formularios-sem-dono", eu], enabled: !!eu, refetchInterval: 60_000,
    queryFn: async () => {
      const { data: linhas, error } = await sb.rpc("formularios_sem_dono", { p_como: como || null });
      if (error) return { linhas: [] as Linha[], gerentes: [] as { id: string; nome: string }[] };
      const ids = (((await sb.rpc("ids_da_arvore", { p: eu })).data ?? []) as any[]).map((r) => (typeof r === "string" ? r : r.ids_da_arvore));
      const { data: ps } = ids.length
        ? await sb.from("profiles").select("id,first_name,last_name").eq("role", "MANAGER").eq("is_active", true).in("id", ids).order("first_name")
        : { data: [] };
      return { linhas: (linhas ?? []) as Linha[], gerentes: ((ps ?? []) as any[]).map((p) => ({ id: p.id, nome: [p.first_name, p.last_name].filter(Boolean).join(" ") })) };
    },
  });
  const linhas = data?.linhas ?? [];
  const parados = useMemo(() => linhas.reduce((s, l) => s + (l.parados || 0), 0), [linhas]);
  if (!linhas.length) return null;

  if (compacto) return (
    <div className="fsd"><style>{CSS}</style>
      <h3>⚠️ {linhas.length} formulário{linhas.length > 1 ? "s" : ""} sem dono{parados ? ` · ${parados} lead${parados > 1 ? "s" : ""} esperando` : ""}</h3>
      <p style={{ margin: 0 }}>Os leads desses formulários não sabem para qual equipe ir. Leva 1 minuto para resolver.{" "}
        {onAbrir ? <button className="fsd-link" onClick={onAbrir}>Resolver agora →</button> : null}</p>
    </div>
  );

  const valorPadrao = (l: Linha) => escolha[l.form_id] ?? (l.recrutamento ? "eu" : l.sugestao ? `equipe:${l.sugestao}` : "");
  const ligar = async (l: Linha) => {
    const v = valorPadrao(l);
    if (!v) { toast.error("Escolha de quem é esse formulário."); return; }
    const [modo, destino] = v.split(":");
    setLigando(l.form_id);
    try {
      const { data: n, error } = await sb.rpc("ligar_formulario", { p_form: l.form_id, p_modo: modo, p_destino: destino || null, p_como: como || null });
      if (error) throw error;
      toast.success(`Pronto. ${n ? `${n} lead${n > 1 ? "s" : ""} parado${n > 1 ? "s" : ""} já foram entregues e o` : "O"}s próximos desse formulário vão direto.`);
      qc.invalidateQueries({ queryKey: ["formularios-sem-dono"] });
      qc.invalidateQueries({ queryKey: ["filas-formulario"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui ligar agora."); }
    finally { setLigando(null); }
  };

  return (
    <div className="fsd"><style>{CSS}</style>
      <h3>⚠️ Formulários sem dono{parados ? ` · ${parados} lead${parados > 1 ? "s" : ""} esperando` : ""}</h3>
      <p>Esses formulários estão recebendo leads e ninguém disse de quem eles são. Escolha a equipe de cada um e toque em <b>Ligar</b>:
        os leads que estão esperando vão na hora, e os próximos também, para a roleta da equipe escolhida.</p>
      {linhas.map((l) => (
        <div className="fsd-i" key={l.form_id}>
          <div className="fsd-n">
            <b>{l.nome}</b>
            <i className="fsd-o">
              {/* De onde vem: a conta de anúncio diz quem paga; a página abre no Facebook (o nome não vem pela API) */}
              {l.page_id ? <>Página {l.pagina_dono ? `da ${l.pagina_dono}` : ""} (<a href={`https://www.facebook.com/${l.page_id}`} target="_blank" rel="noreferrer">abrir no Facebook</a>)</> : "Página desconhecida"}
              {l.conta ? <> · anúncio pago pela conta <b style={{ display: "inline", fontSize: 12.5 }}>{l.conta}</b>{l.conta_dono ? ` (${l.conta_dono})` : ""}</> : null}
            </i>
            <i>{l.parados ? `${l.parados} esperando · ` : ""}{l.leads_14d} leads em 14 dias
              {l.recrutamento ? " · parece recrutamento (candidato a corretor, não cliente)" : l.sugestao_nome ? ` · pelo nome da campanha, parece ser da ${l.sugestao_nome}` : ""}</i>
            {l.anuncios ? <i title={l.anuncios}>Anúncios: {l.anuncios.length > 90 ? l.anuncios.slice(0, 90) + "…" : l.anuncios}</i> : null}
          </div>
          <select value={valorPadrao(l)} onChange={(e) => setEscolha((s) => ({ ...s, [l.form_id]: e.target.value }))} aria-label={`De quem é ${l.nome}`}>
            <option value="" disabled>É de…</option>
            {(data?.gerentes ?? []).map((g) => <option key={g.id} value={`equipe:${g.id}`}>Equipe {g.nome}</option>)}
            <option value="todas">Todas as minhas equipes (roleta geral)</option>
            <option value="eu">Eu mesma(o) atendo{l.recrutamento ? " — recrutamento" : ""}</option>
          </select>
          <button disabled={ligando === l.form_id} onClick={() => ligar(l)}>{ligando === l.form_id ? "Ligando…" : "Ligar"}</button>
        </div>
      ))}
    </div>
  );
}
