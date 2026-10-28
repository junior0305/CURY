/* "Entrar como" (28/10, antes "Ver como" de 20/10): o admin/diretor abre uma sessão REAL do super, gerente ou corretor
 * (src/lib/entrarComo.ts + edge entrar-como) e vê exatamente o que ele vê. Faixa no topo volta para o login dele.
 * Os parâmetros antigos ?super= / ?manager= ainda funcionam nas telas, mas o seletor usa a sessão real.
 *  · super  → /super?super=<id>   (Superintendente.tsx usa o id no lugar do login)
 *  · gerente → /manager?manager=<id> (useEffectiveManagerId já aceitava)
 * Só leitura do ponto de vista de identidade: o que for salvo é salvo como admin.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { entrarComo } from "@/lib/entrarComo";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type P = { id: string; first_name: string | null; last_name: string | null; role: string; manager_id: string | null };
const nome = (p: P) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";

export default function VerComo() {
  const { role } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const pode = role === "ADMIN" || role === "DIRECTOR";
  const { data: lideres = [] } = useQuery<P[]>({
    queryKey: ["ver-como-lideres"],
    enabled: pode,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,first_name,last_name,role,manager_id")
        .in("role", ["SUPERINTENDENT", "MANAGER", "BROKER"]).eq("is_active", true).order("first_name");
      return (data ?? []) as P[];
    },
  });
  const [entrando, setEntrando] = useState(false);
  if (!pode) return null;
  const entrar = async (id: string) => {
    if (!id) return;
    setEntrando(true);
    try { await entrarComo(id); } catch (e: any) { toast.error(e?.message || "Não consegui entrar."); setEntrando(false); }
  };
  const supers = lideres.filter((p) => p.role === "SUPERINTENDENT");
  const gerentes = lideres.filter((p) => p.role === "MANAGER");
  const corretores = lideres.filter((p) => p.role === "BROKER");
  const atualSuper = params.get("super");
  const atualGer = params.get("manager");
  const atual = lideres.find((p) => p.id === (atualSuper || atualGer));

  return (
    <div className="vc">
      <style>{CSS}</style>
      <span className="vc-lbl">{entrando ? "Entrando…" : "Entrar como"}</span>
      <select aria-label="Entrar como superintendente" disabled={entrando} value={atualSuper ?? ""} onChange={(e) => entrar(e.target.value)}>
        <option value="">superintendente…</option>
        {supers.map((p) => <option key={p.id} value={p.id}>{nome(p)}</option>)}
      </select>
      <select aria-label="Entrar como gerente" disabled={entrando} value={atualGer ?? ""} onChange={(e) => entrar(e.target.value)}>
        <option value="">gerente…</option>
        {gerentes.map((p) => {
          const sup = lideres.find((s) => s.id === p.manager_id && s.role === "SUPERINTENDENT");
          return <option key={p.id} value={p.id}>{nome(p)}{sup ? ` · ${sup.first_name}` : ""}</option>;
        })}
      </select>
      <select aria-label="Entrar como corretor" disabled={entrando} value="" onChange={(e) => entrar(e.target.value)}>
        <option value="">corretor…</option>
        {corretores.map((p) => {
          const ger = lideres.find((g) => g.id === p.manager_id && g.role === "MANAGER");
          return <option key={p.id} value={p.id}>{nome(p)}{ger ? ` · ${ger.first_name}` : ""}</option>;
        })}
      </select>
      {atual && (
        <>
          <span className="vc-atual">Vendo a tela de <b>{nome(atual)}</b> ({atual.role === "SUPERINTENDENT" ? "superintendente" : "gerente"})</span>
          <button type="button" className="vc-sair" onClick={() => nav(atual.role === "SUPERINTENDENT" ? "/super" : "/manager")}>Voltar para a minha tela</button>
        </>
      )}
    </div>
  );
}

const CSS = `
.vc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin:0 0 14px;border-radius:12px;background:#0F1B2D;color:#fff;font-size:13px}
.vc-lbl{font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:11.5px;color:#A9B6C9}
.vc select{min-height:34px;padding:0 8px;border-radius:8px;border:1px solid #2A3E5C;background:#14243A;color:#fff;font:inherit}
.vc-atual{color:#E6ECF4}
.vc-atual b{color:#fff}
.mgr10 button.vc-sair,.vc-sair{min-height:34px;padding:0 12px;border-radius:8px;border:1px solid #5EEAD4 !important;background:transparent !important;color:#5EEAD4 !important;font-weight:700;cursor:pointer}
`;
