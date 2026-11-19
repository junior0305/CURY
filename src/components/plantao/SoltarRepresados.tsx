/**
 * SoltarRepresados — botão "Soltar leads (N)" com prévia da divisão.
 * Aparece SÓ para gerente com represa ligada e com leads represados agora (Fase 2, 19/11).
 * Modo manual: é o jeito de soltar. Modo automático: serve pra antecipar antes da hora.
 * Lê o escopo por ?manager= (admin/entrar como) ou a própria sessão. Ver [[project_represa_noturna]].
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/soltar-represados.css";

type Div = { nome: string; qtd: number };
type Dados = { represa_on: boolean; total: number; modo?: string; abre?: string; liberacao?: string; divisao: Div[] };

export default function SoltarRepresados({ como: comoProp }: { como?: string | null }) {
  const sb = supabase as any;
  const [sp] = useSearchParams();
  const como = comoProp ?? sp.get("manager") ?? null;
  const [d, setD] = useState<Dados | null>(null);
  const [aberto, setAberto] = useState(false);
  const [soltando, setSoltando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data } = await sb.rpc("represados_acao", { p_como: como, p_executar: false });
      setD((data || null) as Dados | null);
    } catch { setD(null); }
  }, [como]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!d || !d.represa_on || !d.total) return null;
  const manual = d.liberacao === "manual";

  async function soltar() {
    setSoltando(true);
    const { data, error } = await sb.rpc("represados_acao", { p_como: como, p_executar: true });
    setSoltando(false);
    if (error) {
      const m = String(error.message || "");
      toast.error(m.includes("entrar_como") ? "Saia do 'Entrar como' pra soltar." : m.includes("sem_permissao") ? "Sem permissão." : "Não consegui soltar.");
      return;
    }
    toast.success(`${(data as any)?.total ?? d!.total} lead(s) soltos ✅`);
    setAberto(false); carregar();
  }

  return (
    <div className="srep">
      <div className="srep-top">
        <div className="srep-ic"><Inbox size={18} /></div>
        <div className="srep-tx">
          <b>{d.total} lead{d.total > 1 ? "s" : ""} represado{d.total > 1 ? "s" : ""}</b>
          <span>{manual ? "você solta quando quiser" : `solta sozinho às ${d.abre}`} · divisão por {d.modo === "sorteio" ? "sorteio" : "ordem de chegada"}</span>
        </div>
        <button className="srep-b" onClick={() => setAberto((a) => !a)}>{aberto ? "Fechar" : manual ? "Soltar leads" : "Soltar agora"}</button>
      </div>
      {aberto && (
        <div className="srep-prev">
          <div className="srep-ph">Se soltar agora, fica assim:</div>
          <div className="srep-grid">
            {d.divisao.map((x, i) => (
              <div className="srep-row" key={i}><span className="srep-n">{i + 1}º</span><span className="srep-nome">{x.nome}</span><span className="srep-q">{x.qtd}</span></div>
            ))}
          </div>
          <button className="srep-conf" onClick={soltar} disabled={soltando}>
            {soltando ? <><Loader2 size={15} className="spin" /> Soltando…</> : `Confirmar e soltar ${d.total}`}
          </button>
        </div>
      )}
    </div>
  );
}
