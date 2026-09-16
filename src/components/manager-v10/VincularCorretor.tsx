/* Associar um corretor da Cury a um cadastro que já existe aqui.
 *
 * O caso é o do Cavalcante/Chefe: o acesso nasce no Comandra com um nome, a
 * Cury pede para trocar — às vezes porque o apelido já está em uso lá — e a
 * partir daí a mesma pessoa vira duas: uma na Cury sem vínculo, outra aqui com
 * o nome antigo. Criar login novo cria a duplicata; o certo é associar.
 *
 * A tela nunca decide sozinha. O sinal que acha o par é o nome de batismo, que
 * não muda, e ele produz falso-positivo em nome comum — "Antônio" casa com meio
 * mundo. Quem confirma é o gerente, que conhece a pessoa.                     */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Pessoa } from "@/hooks/useTempoReal";

interface Candidato {
  id: string; nome: string; ativo: boolean; gerente: string | null;
  ja_vinculado: boolean; casou: string[]; pontos: number; login: string | null;
}

export default function VincularCorretor({
  pessoa, managerId, quem, onFechar,
}: {
  pessoa: Pessoa; managerId?: string; quem: string; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [trocarLogin, setTrocarLogin] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vincular", pessoa.curyId],
    enabled: !!pessoa.curyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("corretor-vincular", {
        body: { action: "candidatos", cury_id: pessoa.curyId, quem },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setLogin((data as any).login_sugerido ?? "");
      return data as { candidatos: Candidato[]; login_sugerido: string };
    },
  });

  const alvo = data?.candidatos.find((c) => c.id === escolhido) ?? null;

  async function associar() {
    if (!escolhido) return;
    setSalvando(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("corretor-vincular", {
        body: {
          action: "associar", cury_id: pessoa.curyId, profile_id: escolhido,
          manager_id: managerId, quem, nome: pessoa.apelido,
          // Só manda o login quando o gerente quer trocar. Trocar o email não
          // mexe na senha — ela continua a mesma.
          login: trocarLogin ? login.trim() : "",
        },
      });
      if (error) throw error;
      if ((r as any)?.error) throw new Error((r as any).error);
      if ((r as any)?.aviso) toast.warning((r as any).aviso, { duration: 10000 });
      else toast.success(
        `${(r as any).nome} associado${(r as any).trocou_login
          ? ` — entra com ${(r as any).login} e a mesma senha de antes.` : "."}`,
        { duration: 9000 },
      );
      qc.invalidateQueries({ queryKey: ["tempo-real"] });
      onFechar();
    } catch (e: any) {
      toast.error(`Não consegui associar: ${e?.message ?? e}`, { duration: 9000 });
    } finally { setSalvando(false); }
  }

  return (
    <div className="vinc-fundo" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="vinc" onClick={(e) => e.stopPropagation()}>
        <div className="vinc-h">
          <div>
            <b>{pessoa.nome}</b>
            <i>na Cury aparece como <b>{pessoa.apelido}</b> · bateu ponto hoje</i>
          </div>
          <button className="vinc-x" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {isLoading ? (
          <p className="vinc-n">Procurando cadastros parecidos…</p>
        ) : !data?.candidatos.length ? (
          <>
            <p className="vinc-n">
              Não achei ninguém parecido aqui dentro. É gente nova — crie o login
              pelo cadastro de usuários e ela entra no seu time.
            </p>
            <div className="vinc-f">
              <button className="mini" onClick={onFechar}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <p className="vinc-n">
              Pode ser que ela já tenha cadastro aqui com <b>outro nome</b> — é o que
              acontece quando a Cury pede para trocar o apelido depois que o acesso
              já foi criado. Confira antes de criar um login novo: dois cadastros
              para a mesma pessoa dividem a carteira dela em duas.
            </p>

            <div className="vinc-l">
              {data.candidatos.map((c) => (
                <label className={`vinc-c${escolhido === c.id ? " on" : ""}`} key={c.id}>
                  <input type="radio" name="cand" checked={escolhido === c.id}
                    onChange={() => setEscolhido(c.id)} />
                  <span>
                    <b>{c.nome}</b>
                    <i>
                      {c.login ?? "sem login"}
                      {c.gerente ? ` · equipe de ${c.gerente}` : " · sem equipe"}
                      {!c.ativo ? " · desativado" : ""}
                    </i>
                    <em>bate em: {c.casou.join(", ")}</em>
                  </span>
                  {c.ja_vinculado
                    ? <span className="vinc-ja">já é de outra pessoa na Cury</span>
                    : null}
                </label>
              ))}
            </div>

            {alvo ? (
              <div className="vinc-login">
                <label className="vinc-sw">
                  <input type="checkbox" checked={trocarLogin}
                    onChange={(e) => setTrocarLogin(e.target.checked)} />
                  <span>Trocar o login para o nome novo</span>
                </label>
                {trocarLogin ? (
                  <>
                    <div className="vinc-de">
                      <span>{alvo.login ?? "—"}</span>
                      <em>→</em>
                      <input value={login} onChange={(e) => setLogin(e.target.value)}
                        placeholder="chefe@cury" />
                    </div>
                    <small>A senha continua a mesma — trocar o login não mexe nela.</small>
                  </>
                ) : (
                  <small>Ele continua entrando com <b>{alvo.login ?? "o login atual"}</b>.</small>
                )}
              </div>
            ) : null}

            <div className="vinc-f">
              <button className="mini" onClick={onFechar}>Cancelar</button>
              <button className="mini solid" disabled={!escolhido || salvando}
                onClick={associar}>
                {salvando ? "Associando…" : "É a mesma pessoa — associar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
